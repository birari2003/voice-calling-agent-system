import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import { dialogueEngine, initialContext } from '../ai/deterministicDialogueEngine.js';
import { DEFAULT_QUESTIONNAIRE, withDefaultWording } from '../ai/questionnaireContent.js';
import {
  TERMINAL_STATES,
  type AssistantReply,
  type ConversationContext,
  type Language,
  type QuestionnaireContent,
} from '../ai/types.js';
import {
  CallSession,
  Campaign,
  Citizen,
  Complaint,
  QuestionnaireVersion,
  SessionMessage,
  User,
  type SessionOutcome,
} from '../models/index.js';
import { writeAuditLog } from './auditService.js';
import { recordCampaignSessionEnded } from './campaignProgress.js';
import { ComplaintInputError, createComplaint } from './complaintService.js';

export class SessionError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'SessionError';
  }
}

interface PendingMessage {
  speaker: 'citizen' | 'assistant' | 'system';
  text: string;
  state: string;
  /** Defaults to the conversation language; assistant messages always carry the spoken language. */
  language?: Language | null;
  confidence?: number | null;
  clientMessageId?: string | null;
}

type AuditEntry = [action: string, metadata: Record<string, unknown>];

/** Returns the organization's active questionnaire, creating version 1 from defaults if needed. */
export async function getActiveQuestionnaire(
  organizationId: number,
  actorId: number | null,
): Promise<QuestionnaireVersion> {
  const active = await QuestionnaireVersion.findOne({ where: { organizationId, isActive: true } });
  if (active) return active;
  try {
    return await QuestionnaireVersion.create({
      organizationId,
      version: 1,
      languageContent: DEFAULT_QUESTIONNAIRE,
      isActive: true,
      createdBy: actorId,
      createdAt: new Date(),
    });
  } catch (error) {
    // Another request created version 1 at the same moment.
    if ((error as { name?: string }).name !== 'SequelizeUniqueConstraintError') throw error;
    const created = await QuestionnaireVersion.findOne({
      where: { organizationId, isActive: true },
    });
    if (!created) throw error;
    return created;
  }
}

async function questionnaireFor(session: CallSession, transaction: Transaction) {
  const version = await QuestionnaireVersion.findByPk(session.questionnaireVersionId, {
    transaction,
  });
  if (!version) throw new Error('Questionnaire version for session is missing.');
  return withDefaultWording(version.languageContent as QuestionnaireContent);
}

async function appendMessages(
  session: CallSession,
  messages: PendingMessage[],
  transaction: Transaction,
): Promise<void> {
  if (!messages.length) return;
  const last = (await SessionMessage.max('sequenceNumber', {
    where: { sessionId: session.id },
    transaction,
  })) as number | null;
  const language = session.conversationContext.collected.language;
  const now = new Date();
  await SessionMessage.bulkCreate(
    messages.map((message, index) => ({
      sessionId: session.id,
      sequenceNumber: (last ?? 0) + index + 1,
      speaker: message.speaker,
      messageText: message.text,
      language: message.language === undefined ? language : message.language,
      conversationState: message.state,
      confidence: message.confidence ?? null,
      clientMessageId: message.clientMessageId ?? null,
      createdAt: now,
    })),
    { transaction },
  );
}

/** Language the assistant is speaking in: the chosen one, or the default before a choice. */
function spokenLanguage(context: ConversationContext, content: QuestionnaireContent): Language {
  return context.collected.language ?? content.defaultLanguage;
}

function assistantMessages(replies: AssistantReply[], fallback: Language): PendingMessage[] {
  return replies.map(({ text, state, language }) => ({
    speaker: 'assistant',
    text,
    state,
    language: language ?? fallback,
  }));
}

function applyContext(session: CallSession, context: ConversationContext): void {
  session.conversationContext = context;
  session.conversationState = context.state;
  session.language = context.collected.language;
}

/** Ends the session and updates its campaign recipient, if any, in the same transaction. */
async function endSession(
  session: CallSession,
  outcome: SessionOutcome,
  transaction: Transaction,
): Promise<void> {
  const endedAt = new Date();
  session.status = 'ended';
  session.outcome = outcome;
  session.endedAt = endedAt;
  session.durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
  );
  await recordCampaignSessionEnded(session, outcome, transaction);
}

async function lockSession(organizationId: number, sessionId: string, transaction: Transaction) {
  const session = await CallSession.findOne({
    where: { id: sessionId, organizationId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!session) throw new SessionError('Session was not found.', 404, 'SESSION_NOT_FOUND');
  return session;
}

/** Validation gate between the conversation and complaint creation. */
function complaintInputFrom(session: CallSession) {
  const { collected } = session.conversationContext;
  const missing: string[] = [];
  if (!session.citizenId) missing.push('citizen');
  if (!collected.issueText || collected.issueText.trim().length < 10) missing.push('issue');
  if (!collected.locality || collected.locality.trim().length < 2) missing.push('location');
  if (!collected.citizenName) missing.push('name');
  if (missing.length)
    throw new SessionError(
      `Cannot register the complaint; missing details: ${missing.join(', ')}.`,
      422,
      'SESSION_DETAILS_INCOMPLETE',
    );
  return {
    citizenId: session.citizenId!,
    category: (collected.categorySuggestion ?? 'General').slice(0, 80),
    description: collected.issueText!.trim(),
    locality: collected.locality!.trim(),
    ward: collected.ward,
    landmark: collected.landmark,
    locationVerified: false,
    priority: 'normal' as const,
    confirmed: true as const,
  };
}

/**
 * Creates the complaint for a session whose citizen has explicitly confirmed the read-back.
 * Runs inside the caller's transaction so the session, complaint and transcript commit together.
 */
async function registerConfirmedComplaint(
  session: CallSession,
  actorId: number,
  transaction: Transaction,
  audits: AuditEntry[],
): Promise<Complaint> {
  if (session.conversationState !== 'CREATE_COMPLAINT' || !session.confirmedAt)
    throw new SessionError(
      'The citizen has not confirmed the details yet.',
      409,
      'CONFIRMATION_REQUIRED',
    );
  const input = complaintInputFrom(session);
  const { complaint } = await createComplaint(
    session.organizationId,
    actorId,
    `session:${session.id}`,
    input,
    {
      source: 'simulated_ai',
      sourceSessionId: session.id,
      historyNote:
        'Complaint registered after the citizen confirmed the read-back in a simulated AI session.',
    },
    transaction,
  );

  // Fill in the citizen's name only when the record has none; never overwrite staff-entered data.
  const citizenName = session.conversationContext.collected.citizenName;
  const citizen = await Citizen.findByPk(input.citizenId, { transaction });
  if (citizen && !citizen.fullName && citizenName) {
    citizen.fullName = citizenName;
    citizen.updatedBy = actorId;
    await citizen.save({ transaction });
    audits.push([
      'citizen.name_captured_in_session',
      { citizenId: citizen.id, sessionId: session.id },
    ]);
  }

  const content = await questionnaireFor(session, transaction);
  const ticketTurn = dialogueEngine.ticketMessages(
    session.conversationContext,
    content,
    complaint.ticketId,
  );
  applyContext(session, ticketTurn.context);
  session.complaintId = complaint.id;
  session.errorCode = null;
  session.errorMessage = null;
  await endSession(session, 'complaint_created', transaction);
  await appendMessages(
    session,
    assistantMessages(ticketTurn.replies, spokenLanguage(ticketTurn.context, content)),
    transaction,
  );
  audits.push(['session.complaint_created', { sessionId: session.id, complaintId: complaint.id }]);
  return complaint;
}

async function flushAudits(actorId: number, audits: AuditEntry[]): Promise<void> {
  for (const [action, metadata] of audits) await writeAuditLog(action, actorId, metadata);
}

export interface StartSessionInput {
  citizenId: number;
  language: Language | null;
  channel: 'text' | 'voice';
  /** Set when the session is run for a campaign recipient. */
  campaign?: { campaignId: number; recipientId: number };
}

export async function startSession(
  organizationId: number,
  actorId: number,
  input: StartSessionInput,
): Promise<string> {
  const citizen = await Citizen.findOne({ where: { id: input.citizenId, organizationId } });
  if (!citizen)
    throw new SessionError('Select a citizen in your organization.', 400, 'CITIZEN_NOT_FOUND');
  if (!citizen.isActive)
    throw new SessionError('This citizen record is inactive.', 409, 'CITIZEN_INACTIVE');
  if (citizen.optedOut)
    throw new SessionError(
      'This citizen has opted out of contact. Sessions cannot be started for them.',
      409,
      'CITIZEN_OPTED_OUT',
    );

  const questionnaire = await getActiveQuestionnaire(organizationId, actorId);
  const content = withDefaultWording(questionnaire.languageContent as QuestionnaireContent);
  const turn = dialogueEngine.start(initialContext(citizen.fullName, input.language), content);
  const sessionId = randomUUID();

  await sequelize.transaction(async (transaction) => {
    const session = await CallSession.create(
      {
        id: sessionId,
        organizationId,
        citizenId: citizen.id,
        campaignId: input.campaign?.campaignId ?? null,
        campaignRecipientId: input.campaign?.recipientId ?? null,
        questionnaireVersionId: questionnaire.id,
        mode: 'simulation',
        channel: input.channel,
        provider: 'local',
        providerSessionId: null,
        dialogueEngine: dialogueEngine.name,
        status: 'active',
        conversationState: turn.context.state,
        conversationContext: turn.context,
        language: turn.context.collected.language,
        startedBy: actorId,
        startedAt: new Date(),
      },
      { transaction },
    );
    await appendMessages(
      session,
      [
        {
          speaker: 'system',
          text: `Simulation started from the dashboard in ${input.channel} mode. No real call is placed${
            input.channel === 'voice' ? ' and no audio is stored' : ''
          }.`,
          state: 'INITIAL',
        },
        ...assistantMessages(turn.replies, spokenLanguage(turn.context, content)),
      ],
      transaction,
    );
  });
  await writeAuditLog('session.started', actorId, { sessionId, citizenId: citizen.id });
  return sessionId;
}

/** Throws unless the session is active and the conversation is waiting for the citizen. */
export function assertAwaitingInput(session: CallSession): void {
  if (session.status !== 'active')
    throw new SessionError('This session has already ended.', 409, 'SESSION_ENDED');
  if (TERMINAL_STATES.includes(session.conversationState))
    throw new SessionError(
      'This session is not waiting for citizen input.',
      409,
      'SESSION_NOT_ACCEPTING_INPUT',
    );
}

/**
 * Records that the citizen's speech could not be recognised reliably and has the assistant ask
 * them to repeat. The uncertain transcription itself is not stored.
 */
export async function recordUnrecognisedSpeech(
  organizationId: number,
  sessionId: string,
  reason: 'no_speech' | 'low_confidence',
  confidence: number | null,
): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    const session = await lockSession(organizationId, sessionId, transaction);
    assertAwaitingInput(session);
    const content = await questionnaireFor(session, transaction);
    const turn = dialogueEngine.didNotHear(session.conversationContext, content);
    await appendMessages(
      session,
      [
        {
          speaker: 'system',
          text:
            reason === 'no_speech'
              ? 'No speech was detected in the recording.'
              : `Speech was not recognised reliably${confidence === null ? '' : ` (confidence ${confidence.toFixed(2)})`}; the citizen was asked to repeat.`,
          state: session.conversationState,
          confidence,
        },
        ...assistantMessages(turn.replies, spokenLanguage(turn.context, content)),
      ],
      transaction,
    );
  });
}

/** Loads an assistant message and the language it was written in, for speech synthesis. */
export async function findAssistantMessage(
  organizationId: number,
  sessionId: string,
  messageId: number,
): Promise<{ text: string; language: Language }> {
  const session = await CallSession.findOne({
    where: { id: sessionId, organizationId },
    attributes: ['id', 'language', 'questionnaireVersionId'],
  });
  if (!session) throw new SessionError('Session was not found.', 404, 'SESSION_NOT_FOUND');
  const message = await SessionMessage.findOne({
    where: { id: messageId, sessionId, speaker: 'assistant' },
  });
  if (!message) throw new SessionError('Message was not found.', 404, 'MESSAGE_NOT_FOUND');
  let language = message.language ?? session.language;
  if (!language) {
    const version = await QuestionnaireVersion.findByPk(session.questionnaireVersionId);
    language =
      (version?.languageContent as QuestionnaireContent | undefined)?.defaultLanguage ?? 'as';
  }
  return { text: message.messageText, language };
}

export async function submitCitizenTurn(
  organizationId: number,
  actorId: number,
  sessionId: string,
  text: string,
  clientMessageId: string | null,
  /** Speech-recognition confidence for voice turns; null for typed replies. */
  confidence: number | null = null,
): Promise<{ replayed: boolean }> {
  const audits: AuditEntry[] = [];
  const replayed = await sequelize.transaction(async (transaction) => {
    const session = await lockSession(organizationId, sessionId, transaction);
    if (clientMessageId) {
      const duplicate = await SessionMessage.findOne({
        where: { sessionId, clientMessageId },
        transaction,
      });
      if (duplicate) return true;
    }
    assertAwaitingInput(session);

    const content = await questionnaireFor(session, transaction);
    const answeredState = session.conversationState;
    const turn = dialogueEngine.respond(session.conversationContext, content, text);
    await appendMessages(
      session,
      [{ speaker: 'citizen', text, state: answeredState, clientMessageId, confidence }],
      transaction,
    );
    applyContext(session, turn.context);
    await appendMessages(
      session,
      assistantMessages(turn.replies, spokenLanguage(turn.context, content)),
      transaction,
    );

    if (turn.event === 'cancelled') {
      await endSession(session, 'cancelled_by_citizen', transaction);
      audits.push(['session.cancelled', { sessionId, by: 'citizen' }]);
    } else if (turn.event === 'handoff') {
      await endSession(session, 'handoff', transaction);
      audits.push(['session.handoff', { sessionId }]);
    } else if (turn.event === 'confirmed') {
      session.confirmedAt = new Date();
      audits.push(['session.citizen_confirmed', { sessionId }]);
      try {
        await registerConfirmedComplaint(session, actorId, transaction, audits);
      } catch (error) {
        // Validation problems leave the session confirmed but pending; /confirm can retry.
        if (!(error instanceof SessionError || error instanceof ComplaintInputError)) throw error;
        session.errorCode = error.code;
        session.errorMessage = error.message.slice(0, 500);
        await appendMessages(
          session,
          [
            {
              speaker: 'system',
              text: `Complaint not registered: ${error.message}`,
              state: 'CREATE_COMPLAINT',
            },
          ],
          transaction,
        );
      }
    }
    await session.save({ transaction });
    return false;
  });
  await flushAudits(actorId, audits);
  return { replayed };
}

/**
 * Retries complaint creation for a session the citizen already confirmed. Returns the existing
 * complaint if one was created, so repeated calls never create duplicates.
 */
export async function confirmSession(
  organizationId: number,
  actorId: number,
  sessionId: string,
): Promise<{ complaintId: number; created: boolean }> {
  const audits: AuditEntry[] = [];
  const result = await sequelize.transaction(async (transaction) => {
    const session = await lockSession(organizationId, sessionId, transaction);
    if (session.complaintId) return { complaintId: session.complaintId, created: false };
    if (session.status !== 'active')
      throw new SessionError('This session has already ended.', 409, 'SESSION_ENDED');
    const complaint = await registerConfirmedComplaint(session, actorId, transaction, audits);
    await session.save({ transaction });
    return { complaintId: complaint.id, created: true };
  });
  await flushAudits(actorId, audits);
  return result;
}

export async function cancelSession(
  organizationId: number,
  actorId: number,
  sessionId: string,
): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    const session = await lockSession(organizationId, sessionId, transaction);
    if (session.status !== 'active')
      throw new SessionError('This session has already ended.', 409, 'SESSION_ENDED');
    applyContext(session, { ...session.conversationContext, state: 'CANCELLED', correcting: null });
    await endSession(session, 'cancelled_by_staff', transaction);
    await appendMessages(
      session,
      [
        {
          speaker: 'system',
          text: 'Session cancelled by staff. No complaint was registered.',
          state: 'CANCELLED',
        },
      ],
      transaction,
    );
    await session.save({ transaction });
  });
  await writeAuditLog('session.cancelled', actorId, { sessionId, by: 'staff' });
}

/** Ends a session. Idempotent for sessions that have already ended. */
export async function completeSession(
  organizationId: number,
  actorId: number,
  sessionId: string,
): Promise<void> {
  const ended = await sequelize.transaction(async (transaction) => {
    const session = await lockSession(organizationId, sessionId, transaction);
    if (session.status !== 'active') return false;
    if (session.conversationState === 'CREATE_COMPLAINT')
      throw new SessionError(
        'The citizen confirmed but the complaint is not registered yet. Retry registration or cancel the session.',
        409,
        'COMPLAINT_PENDING',
      );
    await endSession(session, 'ended_without_complaint', transaction);
    await appendMessages(
      session,
      [
        {
          speaker: 'system',
          text: 'Session ended by staff before confirmation. No complaint was registered.',
          state: session.conversationState,
        },
      ],
      transaction,
    );
    await session.save({ transaction });
    return true;
  });
  if (ended) await writeAuditLog('session.ended', actorId, { sessionId });
}

const sessionIncludes = [
  { model: Citizen, as: 'citizen', attributes: ['id', 'fullName', 'phone', 'preferredLanguage'] },
  { model: Complaint, as: 'complaint', attributes: ['id', 'ticketId', 'status'] },
  { model: User, as: 'starter', attributes: ['id', 'name'] },
  { model: Campaign, as: 'campaign', attributes: ['id', 'name', 'status'] },
];

export async function getSessionWithTranscript(organizationId: number, sessionId: string) {
  const session = await CallSession.findOne({
    where: { id: sessionId, organizationId },
    include: [
      ...sessionIncludes,
      {
        model: SessionMessage,
        as: 'messages',
        attributes: [
          'id',
          'sequenceNumber',
          'speaker',
          'messageText',
          'language',
          'conversationState',
          'confidence',
          'createdAt',
        ],
      },
    ],
    order: [[{ model: SessionMessage, as: 'messages' }, 'sequenceNumber', 'ASC']],
  });
  if (!session) throw new SessionError('Session was not found.', 404, 'SESSION_NOT_FOUND');
  return session;
}

export async function listSessions(
  organizationId: number,
  filters: { status?: 'active' | 'ended'; outcome?: SessionOutcome; citizenId?: number },
  page: number,
  limit: number,
) {
  return CallSession.findAndCountAll({
    where: { organizationId, ...filters },
    attributes: { exclude: ['conversationContext'] },
    include: sessionIncludes,
    limit,
    offset: (page - 1) * limit,
    order: [['startedAt', 'DESC']],
  });
}
