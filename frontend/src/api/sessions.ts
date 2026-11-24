import { apiBlob, apiRequest } from './client';

export type Language = 'as' | 'hi' | 'en';
export type SessionOutcome =
  | 'complaint_created'
  | 'cancelled_by_citizen'
  | 'cancelled_by_staff'
  | 'handoff'
  | 'ended_without_complaint';

export interface SessionMessage {
  id: number;
  sequenceNumber: number;
  speaker: 'citizen' | 'assistant' | 'system';
  messageText: string;
  language: Language | null;
  conversationState: string;
  confidence: string | number | null;
  createdAt: string;
}

export interface CollectedFields {
  language: Language | null;
  issueText: string | null;
  categorySuggestion: string | null;
  locality: string | null;
  ward: string | null;
  landmark: string | null;
  citizenName: string | null;
}

export interface SessionSummary {
  id: string;
  mode: 'simulation' | 'telephony';
  channel: 'text' | 'voice';
  status: 'active' | 'ended';
  conversationState: string;
  language: Language | null;
  outcome: SessionOutcome | null;
  complaintId: number | null;
  confirmedAt: string | null;
  errorMessage: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  hasRecording: boolean;
  citizen: { id: number; fullName: string | null; phone: string | null } | null;
  complaint: { id: number; ticketId: string; status: string } | null;
  starter: { id: number; name: string } | null;
  campaign?: { id: number; name: string; status: string } | null;
}

export interface Transcription {
  text: string;
  language: Language;
  /** Null when the speech provider gives no score. */
  confidence: number | null;
  durationSeconds: number;
  accepted: boolean;
  reason: 'no_speech' | 'low_confidence' | null;
  engine: string;
}

export interface AiHealth {
  inputModes: Array<'text' | 'voice'>;
  speechService: { status: 'available' | 'unavailable' };
  speechToText: { engine: string; loaded: boolean; lastProviderError?: string | null } | null;
  textToSpeech: {
    engine: string;
    loadedLanguages: string[];
    lastProviderError?: string | null;
  } | null;
  minimumSpeechConfidence: number;
}

export interface SessionDetail extends SessionSummary {
  collected: CollectedFields | null;
  acceptsInput: boolean;
  messages: SessionMessage[];
}

export interface SessionPage {
  data: SessionSummary[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export const languageLabels: Record<Language, string> = {
  as: 'Assamese',
  hi: 'Hindi',
  en: 'English',
};

export const outcomeLabels: Record<SessionOutcome, string> = {
  complaint_created: 'Complaint created',
  cancelled_by_citizen: 'Cancelled by citizen',
  cancelled_by_staff: 'Cancelled by staff',
  handoff: 'Needs staff follow-up',
  ended_without_complaint: 'Ended without complaint',
};

export const stepLabels: Record<string, string> = {
  INITIAL: 'Starting',
  DISCLOSURE: 'AI disclosure',
  LANGUAGE_SELECTION: 'Choosing language',
  ASK_ISSUE: 'Asking about the problem',
  CLARIFY_ISSUE: 'Clarifying the problem',
  ASK_LOCATION: 'Asking for the location',
  CLARIFY_LOCATION: 'Clarifying the location',
  ASK_NAME: 'Asking for the name',
  READ_BACK: 'Reading back details',
  AWAIT_CONFIRMATION: 'Waiting for confirmation',
  ASK_CORRECTION_FIELD: 'Asking what to correct',
  CREATE_COMPLAINT: 'Registering complaint',
  TICKET_CONFIRMATION: 'Ticket announced',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  HANDOFF_OR_ERROR: 'Handed off',
};

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export const sessionsApi = {
  get: (id: string) => apiRequest<{ data: SessionDetail }>(`/sessions/${id}`),
  list: (query: string) => apiRequest<SessionPage>(`/sessions?${query}`),
  start: (citizenId: number, language: Language | null, channel: 'text' | 'voice') =>
    apiRequest<{ data: SessionDetail }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ citizenId, language, channel }),
    }),
  audioTurn: (id: string, audio: Blob) => {
    const form = new FormData();
    form.append('clientMessageId', crypto.randomUUID());
    form.append('audio', audio, 'speech');
    return apiRequest<{ data: SessionDetail; transcription: Transcription }>(
      `/sessions/${id}/audio-turn`,
      { method: 'POST', body: form },
    );
  },
  speech: (id: string, messageId: number) =>
    apiBlob(`/sessions/${id}/messages/${messageId}/speech`),
  aiHealth: () => apiRequest<{ data: AiHealth }>('/ai/health'),
  turn: (id: string, text: string) =>
    apiRequest<{ data: SessionDetail }>(`/sessions/${id}/turn`, {
      method: 'POST',
      body: JSON.stringify({ text, clientMessageId: crypto.randomUUID() }),
    }),
  action: (id: string, action: 'confirm' | 'cancel' | 'complete') =>
    apiRequest<{ data: SessionDetail }>(`/sessions/${id}/${action}`, { method: 'POST' }),
};
