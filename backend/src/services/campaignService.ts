import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { sequelize } from '../config/database.js';
import {
  CallSession,
  Campaign,
  CampaignRecipient,
  Citizen,
  User,
  type CampaignStatus,
  type CampaignTargetFilter,
  type ExclusionReason,
} from '../models/index.js';
import type { Language } from '../ai/types.js';
import { writeAuditLog } from './auditService.js';
import { exclusionReason } from './campaignEligibility.js';
import { completeCampaignIfDone } from './campaignProgress.js';
import { cancelSession, getActiveQuestionnaire, startSession } from './sessionService.js';

/** A simulation campaign is a controlled batch, never mass calling. */
export const MAX_RECIPIENTS = 100;
const LIVE_STATUSES: CampaignStatus[] = ['ready', 'running', 'paused'];
const EDITABLE_STATUSES: CampaignStatus[] = ['draft', 'ready'];

export class CampaignError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'CampaignError';
  }
}

export interface CampaignInput {
  name: string;
  description: string | null;
  defaultLanguage: Language | null;
  channel: 'text' | 'voice';
  targetFilter: CampaignTargetFilter;
  maxAttempts: number;
  scheduledAt: Date | null;
}

async function loadCampaign(
  organizationId: number,
  campaignId: number,
  transaction?: Transaction,
): Promise<Campaign> {
  const campaign = await Campaign.findOne({
    where: { id: campaignId, organizationId },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!campaign) throw new CampaignError('Campaign was not found.', 404, 'CAMPAIGN_NOT_FOUND');
  return campaign;
}

function requireStatus(campaign: Campaign, allowed: CampaignStatus[], action: string): void {
  if (!allowed.includes(campaign.status))
    throw new CampaignError(
      `A ${campaign.status} campaign cannot be ${action}.`,
      409,
      'INVALID_CAMPAIGN_STATE',
    );
}

export async function recipientCounts(campaignIds: number[]) {
  if (!campaignIds.length) return new Map<number, Record<string, number>>();
  const rows = (await CampaignRecipient.findAll({
    where: { campaignId: campaignIds },
    attributes: ['campaignId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['campaignId', 'status'],
    raw: true,
  })) as unknown as Array<{ campaignId: number; status: string; count: number | string }>;
  const counts = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const entry = counts.get(row.campaignId) ?? {};
    entry[row.status] = Number(row.count);
    counts.set(row.campaignId, entry);
  }
  return counts;
}

export async function createCampaign(
  organizationId: number,
  actorId: number,
  input: CampaignInput,
) {
  const questionnaire = await getActiveQuestionnaire(organizationId, actorId);
  const campaign = await Campaign.create({
    organizationId,
    ...input,
    status: 'draft',
    questionnaireVersionId: questionnaire.id,
    createdBy: actorId,
  });
  await writeAuditLog('campaign.created', actorId, { campaignId: campaign.id });
  return campaign;
}

export async function updateCampaign(
  organizationId: number,
  actorId: number,
  campaignId: number,
  input: Partial<CampaignInput>,
) {
  const campaign = await loadCampaign(organizationId, campaignId);
  requireStatus(campaign, EDITABLE_STATUSES, 'edited');
  Object.assign(campaign, input);
  // Any change invalidates an earlier eligibility preview.
  if (campaign.status === 'ready') campaign.status = 'draft';
  await sequelize.transaction(async (transaction) => {
    await CampaignRecipient.destroy({ where: { campaignId: campaign.id }, transaction });
    await campaign.save({ transaction });
  });
  await writeAuditLog('campaign.updated', actorId, { campaignId: campaign.id });
  return campaign;
}

function targetWhere(organizationId: number, filter: CampaignTargetFilter): WhereOptions {
  const where: Record<string | symbol, unknown> = { organizationId };
  if (filter.wards?.length) where.ward = filter.wards;
  if (filter.locality) where.locality = { [Op.like]: `%${filter.locality}%` };
  if (filter.language) where.preferredLanguage = filter.language;
  return where;
}

async function citizensInOtherLiveCampaigns(
  organizationId: number,
  campaignId: number,
  citizenIds: number[],
  transaction?: Transaction,
): Promise<Set<number>> {
  if (!citizenIds.length) return new Set();
  const rows = await CampaignRecipient.findAll({
    where: {
      citizenId: citizenIds,
      campaignId: { [Op.ne]: campaignId },
      status: ['pending', 'in_progress'],
    },
    include: [
      {
        model: Campaign,
        as: 'campaign',
        required: true,
        attributes: [],
        where: { organizationId, status: LIVE_STATUSES },
      },
    ],
    attributes: ['citizenId'],
    transaction,
  });
  return new Set(rows.map(({ citizenId }) => citizenId));
}

function factsFor(citizen: Citizen, busy: Set<number>) {
  return {
    isActive: citizen.isActive,
    optedOut: citizen.optedOut,
    phone: citizen.phone,
    contactAuthorized: citizen.contactAuthorized,
    consentSource: citizen.consentSource,
    consentRecordedAt: citizen.consentRecordedAt,
    inAnotherLiveCampaign: busy.has(citizen.id),
  };
}

/**
 * Evaluates the target group and stores the result as the campaign's recipient list:
 * eligible citizens become pending, excluded ones are kept with their reason so staff can see
 * exactly who was left out and why. The campaign becomes ready only if 1–100 are eligible.
 */
export async function previewEligibility(
  organizationId: number,
  actorId: number,
  campaignId: number,
) {
  const result = await sequelize.transaction(async (transaction) => {
    const campaign = await loadCampaign(organizationId, campaignId, transaction);
    requireStatus(campaign, EDITABLE_STATUSES, 'previewed');
    const citizens = await Citizen.findAll({
      where: targetWhere(organizationId, campaign.targetFilter),
      order: [['id', 'ASC']],
      transaction,
    });
    const busy = await citizensInOtherLiveCampaigns(
      organizationId,
      campaign.id,
      citizens.map(({ id }) => id),
      transaction,
    );
    const evaluated = citizens.map((citizen) => ({
      citizen,
      reason: exclusionReason(factsFor(citizen, busy)),
    }));
    const eligible = evaluated.filter(({ reason }) => !reason).length;
    const excluded: Partial<Record<ExclusionReason, number>> = {};
    for (const { reason } of evaluated) if (reason) excluded[reason] = (excluded[reason] ?? 0) + 1;

    await CampaignRecipient.destroy({ where: { campaignId: campaign.id }, transaction });
    const now = new Date();
    if (evaluated.length)
      await CampaignRecipient.bulkCreate(
        evaluated.map(({ citizen, reason }) => ({
          campaignId: campaign.id,
          citizenId: citizen.id,
          status: reason ? (reason === 'opted_out' ? 'opted_out' : 'skipped') : 'pending',
          exclusionReason: reason,
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        })),
        { transaction },
      );
    const tooMany = eligible > MAX_RECIPIENTS;
    campaign.status = eligible > 0 && !tooMany ? 'ready' : 'draft';
    await campaign.save({ transaction });
    return {
      campaignStatus: campaign.status,
      matched: evaluated.length,
      eligible,
      excluded,
      maxRecipients: MAX_RECIPIENTS,
      exceedsLimit: tooMany,
    };
  });
  await writeAuditLog('campaign.eligibility_previewed', actorId, {
    campaignId,
    eligible: result.eligible,
  });
  return result;
}

/** Re-checks pending recipients right before work starts; consent can change after a preview. */
async function recheckPending(campaign: Campaign, transaction: Transaction): Promise<number> {
  const pending = await CampaignRecipient.findAll({
    where: { campaignId: campaign.id, status: 'pending' },
    include: [{ model: Citizen, as: 'citizen' }],
    transaction,
  });
  const busy = await citizensInOtherLiveCampaigns(
    campaign.organizationId,
    campaign.id,
    pending.map(({ citizenId }) => citizenId),
    transaction,
  );
  let stillPending = 0;
  for (const recipient of pending) {
    const reason = recipient.citizen
      ? exclusionReason(factsFor(recipient.citizen, busy))
      : 'inactive';
    if (!reason) {
      stillPending += 1;
      continue;
    }
    recipient.status = reason === 'opted_out' ? 'opted_out' : 'skipped';
    recipient.exclusionReason = reason;
    await recipient.save({ transaction });
  }
  return stillPending;
}

export async function startCampaign(organizationId: number, actorId: number, campaignId: number) {
  const campaign = await sequelize.transaction(async (transaction) => {
    const loaded = await loadCampaign(organizationId, campaignId, transaction);
    requireStatus(loaded, ['ready'], 'started');
    const pending = await recheckPending(loaded, transaction);
    if (!pending)
      throw new CampaignError(
        'No eligible recipients remain. Run the eligibility preview again.',
        409,
        'NO_ELIGIBLE_RECIPIENTS',
      );
    loaded.status = 'running';
    loaded.startedAt = new Date();
    await loaded.save({ transaction });
    return loaded;
  });
  await writeAuditLog('campaign.started', actorId, { campaignId, mode: 'simulation' });
  return campaign;
}

export async function pauseCampaign(organizationId: number, actorId: number, campaignId: number) {
  const campaign = await loadCampaign(organizationId, campaignId);
  requireStatus(campaign, ['running'], 'paused');
  campaign.status = 'paused';
  await campaign.save();
  await writeAuditLog('campaign.paused', actorId, { campaignId });
  return campaign;
}

export async function resumeCampaign(organizationId: number, actorId: number, campaignId: number) {
  const campaign = await sequelize.transaction(async (transaction) => {
    const loaded = await loadCampaign(organizationId, campaignId, transaction);
    requireStatus(loaded, ['paused'], 'resumed');
    await recheckPending(loaded, transaction);
    loaded.status = 'running';
    await loaded.save({ transaction });
    await completeCampaignIfDone(loaded, transaction);
    return loaded;
  });
  await writeAuditLog('campaign.resumed', actorId, { campaignId });
  return campaign;
}

/** Stops all pending work: pending recipients are skipped and live sessions are cancelled. */
export async function cancelCampaign(organizationId: number, actorId: number, campaignId: number) {
  const campaign = await sequelize.transaction(async (transaction) => {
    const loaded = await loadCampaign(organizationId, campaignId, transaction);
    requireStatus(loaded, ['draft', 'ready', 'running', 'paused'], 'cancelled');
    loaded.status = 'cancelled';
    loaded.cancelledAt = new Date();
    await loaded.save({ transaction });
    await CampaignRecipient.update(
      { status: 'skipped' },
      { where: { campaignId: loaded.id, status: 'pending' }, transaction },
    );
    return loaded;
  });
  const liveSessions = await CallSession.findAll({
    where: { campaignId, organizationId, status: 'active' },
    attributes: ['id'],
  });
  for (const session of liveSessions) await cancelSession(organizationId, actorId, session.id);
  await writeAuditLog('campaign.cancelled', actorId, {
    campaignId,
    cancelledSessions: liveSessions.length,
  });
  return campaign;
}

/**
 * Hands the next pending recipient to the call studio. Eligibility is checked again for that
 * citizen; anyone who has opted out or lost authorization since the preview is skipped.
 */
export async function startNextSession(
  organizationId: number,
  actorId: number,
  campaignId: number,
  channel: 'text' | 'voice' | undefined,
) {
  const claimed = await sequelize.transaction(async (transaction) => {
    const campaign = await loadCampaign(organizationId, campaignId, transaction);
    requireStatus(campaign, ['running'], 'used to start sessions');
    for (;;) {
      const recipient = await CampaignRecipient.findOne({
        where: { campaignId: campaign.id, status: 'pending' },
        include: [{ model: Citizen, as: 'citizen' }],
        order: [['id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!recipient) {
        await completeCampaignIfDone(campaign, transaction);
        return null;
      }
      const busy = await citizensInOtherLiveCampaigns(
        organizationId,
        campaign.id,
        [recipient.citizenId],
        transaction,
      );
      const reason = recipient.citizen
        ? exclusionReason(factsFor(recipient.citizen, busy))
        : 'inactive';
      if (reason) {
        recipient.status = reason === 'opted_out' ? 'opted_out' : 'skipped';
        recipient.exclusionReason = reason;
        await recipient.save({ transaction });
        continue;
      }
      recipient.status = 'in_progress';
      recipient.attemptCount += 1;
      recipient.lastAttemptAt = new Date();
      await recipient.save({ transaction });
      return { campaign, recipient };
    }
  });
  if (!claimed) return null;
  try {
    const sessionId = await startSession(organizationId, actorId, {
      citizenId: claimed.recipient.citizenId,
      language: claimed.campaign.defaultLanguage,
      channel: channel ?? claimed.campaign.channel,
      campaign: { campaignId: claimed.campaign.id, recipientId: claimed.recipient.id },
    });
    await CampaignRecipient.update(
      { lastSessionId: sessionId },
      { where: { id: claimed.recipient.id } },
    );
    return { sessionId, recipientId: claimed.recipient.id };
  } catch (error) {
    // Give the recipient back so the failed start does not use up an attempt.
    await CampaignRecipient.update(
      { status: 'pending', attemptCount: Math.max(0, claimed.recipient.attemptCount - 1) },
      { where: { id: claimed.recipient.id, status: 'in_progress' } },
    );
    throw error;
  }
}

export async function listCampaigns(organizationId: number, page: number, limit: number) {
  const result = await Campaign.findAndCountAll({
    where: { organizationId },
    include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  const counts = await recipientCounts(result.rows.map(({ id }) => id));
  return {
    rows: result.rows.map((campaign) => ({
      ...campaign.get({ plain: true }),
      recipientCounts: counts.get(campaign.id) ?? {},
    })),
    count: result.count,
  };
}

export async function getCampaign(organizationId: number, campaignId: number) {
  const campaign = await Campaign.findOne({
    where: { id: campaignId, organizationId },
    include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
  });
  if (!campaign) throw new CampaignError('Campaign was not found.', 404, 'CAMPAIGN_NOT_FOUND');
  const counts = await recipientCounts([campaign.id]);
  const excluded = (await CampaignRecipient.findAll({
    where: { campaignId: campaign.id, exclusionReason: { [Op.ne]: null } },
    attributes: ['exclusionReason', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['exclusionReason'],
    raw: true,
  })) as unknown as Array<{ exclusionReason: ExclusionReason; count: number | string }>;
  return {
    ...campaign.get({ plain: true }),
    recipientCounts: counts.get(campaign.id) ?? {},
    exclusionCounts: Object.fromEntries(
      excluded.map(({ exclusionReason: reason, count }) => [reason, Number(count)]),
    ),
  };
}

export async function listRecipients(
  organizationId: number,
  campaignId: number,
  status: string | undefined,
  page: number,
  limit: number,
) {
  await loadCampaign(organizationId, campaignId);
  return CampaignRecipient.findAndCountAll({
    where: { campaignId, ...(status ? { status } : {}) },
    include: [
      {
        model: Citizen,
        as: 'citizen',
        attributes: ['id', 'fullName', 'phone', 'ward', 'locality', 'preferredLanguage'],
      },
      {
        model: CallSession,
        as: 'lastSession',
        attributes: ['id', 'status', 'outcome', 'complaintId', 'durationSeconds'],
      },
    ],
    order: [['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });
}
