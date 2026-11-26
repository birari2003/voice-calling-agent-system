import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { SpeechServiceError, speechService } from '../ai/speech.js';
import { assessTranscription } from '../ai/speechGate.js';
import { env } from '../config/env.js';
import { localityKeyterms } from '../services/localityTerms.js';
import { CallSession } from '../models/index.js';
import {
  assertAwaitingInput,
  findAssistantMessage,
  getSessionWithTranscript,
  recordUnrecognisedSpeech,
  SessionError,
  submitCitizenTurn,
} from '../services/sessionService.js';
import {
  actorId,
  organizationId,
  parseSessionId,
  publicSession,
  sendDomainError,
} from './sessionController.js';

const LOCATION_STATES = ['ASK_LOCATION', 'CLARIFY_LOCATION'];
const CONTROL_STATES = ['AWAIT_CONFIRMATION', 'ASK_CORRECTION_FIELD', 'LANGUAGE_SELECTION'];
const AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/mpeg',
];
const clientMessageIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .optional();

/** Citizen audio is kept in memory only for the transcription request; it is never stored. */
export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
  fileFilter: (_request, file, callback) => {
    const baseType = file.mimetype.split(';')[0]!.trim().toLowerCase();
    callback(null, AUDIO_TYPES.includes(baseType));
  },
}).single('audio');

export async function audioTurnHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = parseSessionId(request, response);
  if (!sessionId) return;
  const clientMessageId = clientMessageIdSchema.safeParse(request.body?.clientMessageId);
  if (!request.file || !clientMessageId.success) {
    response.status(400).json({
      error: {
        code: 'AUDIO_REQUIRED',
        message: 'Send a WebM, Ogg, WAV, MP4 or MP3 recording in the "audio" field.',
      },
    });
    return;
  }
  try {
    const orgId = organizationId(request);
    const session = await CallSession.findOne({ where: { id: sessionId, organizationId: orgId } });
    if (!session) throw new SessionError('Session was not found.', 404, 'SESSION_NOT_FOUND');
    // Check before the (slow) transcription so ended sessions fail fast.
    assertAwaitingInput(session);
    const hint = session.conversationState === 'LANGUAGE_SELECTION' ? null : session.language;
    // Local place names help recognition, but only while a location is being given; they are
    // never sent for yes/no answers, where biasing the recognizer could change the meaning.
    const keyterms = LOCATION_STATES.includes(session.conversationState)
      ? await localityKeyterms(orgId)
      : undefined;
    const result = await speechService.transcribe(
      request.file.buffer,
      request.file.mimetype,
      hint,
      keyterms,
    );
    // Short control answers (yes/no, language, which field to correct) decide what happens
    // next, so they need the strict threshold. Free-text answers are always read back to the
    // citizen before anything is saved, so a lower threshold avoids needless "please repeat".
    const strict = CONTROL_STATES.includes(session.conversationState);
    const assessment = assessTranscription(
      result,
      strict ? env.STT_MIN_CONFIDENCE : env.STT_MIN_CONFIDENCE_FREE_TEXT,
    );
    if (assessment.accepted) {
      await submitCitizenTurn(
        orgId,
        actorId(request),
        sessionId,
        result.text.slice(0, 1000),
        clientMessageId.data ?? null,
        result.confidence,
      );
    } else {
      await recordUnrecognisedSpeech(orgId, sessionId, assessment.reason, result.confidence);
    }
    const updated = await getSessionWithTranscript(orgId, sessionId);
    response.json({
      data: publicSession(updated),
      transcription: {
        text: result.text,
        language: result.language,
        confidence: result.confidence,
        durationSeconds: result.durationSeconds,
        accepted: assessment.accepted,
        reason: assessment.accepted ? null : assessment.reason,
        engine: result.engine,
      },
    });
  } catch (error) {
    sendDomainError(error, response, next);
  }
}

export async function messageSpeechHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = parseSessionId(request, response);
  if (!sessionId) return;
  const messageId = z.coerce.number().int().positive().safeParse(request.params.messageId);
  if (!messageId.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Message ID is invalid.' } });
    return;
  }
  try {
    const orgId = organizationId(request);
    const message = await findAssistantMessage(orgId, sessionId, messageId.data);
    const speech = await speechService.synthesizeStream(message.text, message.language);
    if (!speech.body) {
      throw new SpeechServiceError('ElevenLabs returned no audio.', 503, 'SPEECH_EMPTY');
    }
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Cache-Control', 'private, max-age=600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.flushHeaders();

    const reader = speech.body.getReader();
    try {
      while (!response.destroyed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!response.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => response.once('drain', resolve));
        }
      }
    } finally {
      if (response.destroyed) await reader.cancel().catch(() => undefined);
      else response.end();
    }
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined);
      return;
    }
    sendDomainError(error, response, next);
  }
}
