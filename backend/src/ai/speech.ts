import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import type { Language } from './types.js';

const API = 'https://api.elevenlabs.io/v1';
const TO_SCRIBE: Record<Language, string> = { as: 'asm', hi: 'hin', en: 'eng' };
const FROM_SCRIBE: Record<string, Language> = {
  as: 'as',
  asm: 'as',
  bn: 'as',
  ben: 'as',
  hi: 'hi',
  hin: 'hi',
  mr: 'hi',
  mar: 'hi',
  ne: 'hi',
  nep: 'hi',
  en: 'en',
  eng: 'en',
};

export interface TranscriptionResult {
  text: string;
  language: Language;
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

export interface SpeechService {
  transcribe(
    audio: Buffer,
    mimeType: string,
    languageHint: Language | null,
    keyterms?: string[],
  ): Promise<TranscriptionResult>;
  synthesize(text: string, language: Language): Promise<Buffer>;
  synthesizeStream(text: string, language: Language): Promise<Response>;
  health(): Promise<SpeechServiceHealth>;
}

export class SpeechServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'SpeechServiceError';
  }
}

interface ScribeWord {
  type?: string;
  logprob?: number;
  end?: number;
}
interface ScribeResponse {
  text?: string;
  language_code?: string;
  words?: ScribeWord[];
}

/** Direct ElevenLabs client. The API key never leaves the Node backend. */
export class ElevenLabsSpeechService implements SpeechService {
  private lastProviderError: string | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    if (!this.apiKey) {
      throw new SpeechServiceError(
        'Voice is not configured. Set ELEVENLABS_API_KEY in backend/.env.',
        503,
        'SPEECH_NOT_CONFIGURED',
      );
    }
    try {
      const response = await fetch(`${API}${path}`, {
        ...init,
        headers: { ...init.headers, 'xi-api-key': this.apiKey },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.ok) {
        this.lastProviderError = null;
        return response;
      }
      const providerBody = (await response.json().catch(() => null)) as {
        detail?: { status?: string; message?: string };
      } | null;
      const providerStatus = providerBody?.detail?.status ?? null;
      const invalidKey =
        response.status === 401 ||
        response.status === 403 ||
        providerStatus === 'api_key_id_used_as_api_key';
      this.lastProviderError = invalidKey ? 'invalid API key' : `HTTP ${response.status}`;
      logger.error('ElevenLabs request failed', {
        path,
        status: response.status,
        providerStatus,
      });
      throw new SpeechServiceError(
        invalidKey
          ? providerStatus === 'api_key_id_used_as_api_key'
            ? 'The configured ElevenLabs value is a key ID, not an API key. Create or rotate a key and use the secret beginning with sk_.'
            : 'ElevenLabs rejected the API key or its permissions.'
          : 'ElevenLabs is temporarily unavailable.',
        response.status === 429 ? 429 : 503,
        response.status === 429 ? 'SPEECH_RATE_LIMITED' : 'SPEECH_PROVIDER_ERROR',
      );
    } catch (error) {
      if (error instanceof SpeechServiceError) throw error;
      const timedOut = (error as { name?: string }).name === 'TimeoutError';
      this.lastProviderError = timedOut ? 'timeout' : 'network error';
      throw new SpeechServiceError(
        timedOut ? 'ElevenLabs took too long to respond.' : 'ElevenLabs could not be reached.',
        timedOut ? 504 : 503,
        timedOut ? 'SPEECH_TIMEOUT' : 'SPEECH_UNAVAILABLE',
      );
    }
  }

  async transcribe(
    audio: Buffer,
    mimeType: string,
    languageHint: Language | null,
    keyterms?: string[],
  ): Promise<TranscriptionResult> {
    const form = new FormData();
    // Copy into an ArrayBuffer-backed view. Node Buffers may be typed as SharedArrayBuffer-backed,
    // which is intentionally not accepted by the web BlobPart type.
    const blobBytes = Uint8Array.from(audio);
    form.append(
      'file',
      new Blob([blobBytes], { type: mimeType }),
      `speech.${extensionFor(mimeType)}`,
    );
    form.append('model_id', env.ELEVENLABS_STT_MODEL);
    form.append('timestamps_granularity', 'word');
    form.append('tag_audio_events', 'false');
    if (languageHint) form.append('language_code', TO_SCRIBE[languageHint]);
    for (const term of cleanKeyterms(keyterms)) form.append('keyterms', term);
    const response = await this.request('/speech-to-text', { method: 'POST', body: form });
    const result = (await response.json()) as ScribeResponse;
    const text = result.text?.trim() ?? '';
    const words = (result.words ?? []).filter((word) => word.type === 'word');
    const probabilities = words
      .map((word) => word.logprob)
      .filter((value): value is number => typeof value === 'number')
      .map((value) => Math.exp(value));
    const confidence = probabilities.length
      ? Number(
          (probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length).toFixed(3),
        )
      : null;
    return {
      text,
      language:
        languageHint ??
        FROM_SCRIBE[(result.language_code ?? '').toLowerCase()] ??
        env.DEFAULT_LANGUAGE,
      confidence,
      durationSeconds: Number((words.at(-1)?.end ?? 0).toFixed(2)),
      noSpeech: !text,
      engine: `elevenlabs-${env.ELEVENLABS_STT_MODEL}`,
    };
  }

  async synthesize(text: string, language: Language): Promise<Buffer> {
    const response = await this.request(
      `/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}?output_format=wav_16000`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: env.ELEVENLABS_TTS_MODEL,
          language_code: language,
          apply_text_normalization: 'auto',
        }),
      },
    );
    return Buffer.from(await response.arrayBuffer());
  }

  /** Returns the provider response without buffering so callers can play the first bytes. */
  async synthesizeStream(text: string, language: Language): Promise<Response> {
    return this.request(
      `/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}/stream?output_format=mp3_22050_32`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: env.ELEVENLABS_TTS_MODEL,
          language_code: language,
          apply_text_normalization: 'auto',
        }),
      },
    );
  }

  async health(): Promise<SpeechServiceHealth> {
    if (!this.apiKey || !this.apiKey.startsWith('sk_')) return { reachable: false };
    return {
      reachable: true,
      speechToText: {
        engine: `elevenlabs-${env.ELEVENLABS_STT_MODEL}`,
        loaded: true,
        lastProviderError: this.lastProviderError,
      },
      textToSpeech: {
        engine: `elevenlabs-${env.ELEVENLABS_TTS_MODEL}`,
        loadedLanguages: ['as', 'hi', 'en'],
        lastProviderError: this.lastProviderError,
      },
    };
  }
}

function cleanKeyterms(keyterms?: string[]): string[] {
  return (keyterms ?? [])
    .map((term) => term.replace(/[<>{}[\]\\]/g, ' ').trim())
    .filter((term) => term.length > 0 && term.length <= 50 && term.split(/\s+/).length <= 5)
    .slice(0, 50);
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  return 'webm';
}

export const speechService: SpeechService = new ElevenLabsSpeechService(
  env.ELEVENLABS_API_KEY,
  env.ELEVENLABS_TIMEOUT_MS,
);
