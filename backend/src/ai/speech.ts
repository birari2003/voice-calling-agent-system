import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import type { Language } from './types.js';

export interface TranscriptionResult {
  text: string;
  language: Language;
  /** 0..1 heuristic from the recognizer; a hint, not proof of correctness. */
  /** 0..1 recognizer score, or null when the provider gives none (e.g. Sarvam). */
  confidence: number | null;
  durationSeconds: number;
  noSpeech: boolean;
  engine: string;
}

export interface SpeechServiceHealth {
  reachable: boolean;
  speechToText?: { engine: string; loaded: boolean; lastProviderError?: string | null };
  textToSpeech?: { engine: string; loadedLanguages: string[]; lastProviderError?: string | null };
}

/** Speech recognition and synthesis. Audio is processed in memory and never stored. */
export interface SpeechService {
  transcribe(
    audio: Buffer,
    mimeType: string,
    languageHint: Language | null,
    /** Local words (e.g. locality names) the engine should listen for. */
    keyterms?: string[],
  ): Promise<TranscriptionResult>;
  synthesize(text: string, language: Language): Promise<Buffer>;
  health(): Promise<SpeechServiceHealth>;
}

export class SpeechServiceError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'SpeechServiceError';
  }
}

const UNAVAILABLE_MESSAGE =
  'The speech service is not available. Continue by typing the citizen’s replies.';

/** Client for the local Python ai-service. */
export class HttpSpeechService implements SpeechService {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  private async call(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers ?? {}), 'X-AI-Service-Token': this.token },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = (error as { name?: string }).name === 'TimeoutError';
      throw new SpeechServiceError(
        timedOut ? 'The speech service took too long to respond.' : UNAVAILABLE_MESSAGE,
        timedOut ? 504 : 503,
        timedOut ? 'AI_SERVICE_TIMEOUT' : 'AI_SERVICE_UNAVAILABLE',
      );
    }
    if (response.ok) return response;
    const body = (await response.json().catch(() => ({}))) as {
      detail?: { code?: string; message?: string };
    };
    if (response.status === 422 || response.status === 413 || response.status === 400) {
      throw new SpeechServiceError(
        body.detail?.message ?? 'The audio could not be processed.',
        422,
        body.detail?.code ?? 'AUDIO_INVALID',
      );
    }
    logger.error('speech service error', { status: response.status, path });
    throw new SpeechServiceError(UNAVAILABLE_MESSAGE, 503, 'AI_SERVICE_ERROR');
  }

  async transcribe(
    audio: Buffer,
    mimeType: string,
    languageHint: Language | null,
    keyterms?: string[],
  ) {
    const form = new FormData();
    form.append('audio', new Blob([audio], { type: mimeType }), 'speech');
    if (languageHint) form.append('language', languageHint);
    if (keyterms?.length) form.append('keyterms', JSON.stringify(keyterms));
    const response = await this.call('/v1/transcribe', { method: 'POST', body: form });
    return (await response.json()) as TranscriptionResult;
  }

  async synthesize(text: string, language: Language): Promise<Buffer> {
    const response = await this.call('/v1/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });
    return Buffer.from(await response.arrayBuffer());
  }

  async health(): Promise<SpeechServiceHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return { reachable: false };
      return {
        reachable: true,
        ...((await response.json()) as Omit<SpeechServiceHealth, 'reachable'>),
      };
    } catch {
      return { reachable: false };
    }
  }
}

export const speechService: SpeechService = new HttpSpeechService(
  env.AI_SERVICE_URL.replace(/\/$/, ''),
  env.AI_SERVICE_TOKEN,
  env.AI_SERVICE_TIMEOUT_MS,
);
