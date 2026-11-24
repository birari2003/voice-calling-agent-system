export const LANGUAGES = ['as', 'hi', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CONVERSATION_STATES = [
  'INITIAL',
  'DISCLOSURE',
  'LANGUAGE_SELECTION',
  'ASK_ISSUE',
  'CLARIFY_ISSUE',
  'ASK_LOCATION',
  'CLARIFY_LOCATION',
  'ASK_NAME',
  'READ_BACK',
  'AWAIT_CONFIRMATION',
  'ASK_CORRECTION_FIELD',
  'CREATE_COMPLAINT',
  'TICKET_CONFIRMATION',
  'COMPLETED',
  'CANCELLED',
  'HANDOFF_OR_ERROR',
] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

/** States in which the conversation no longer accepts citizen input. */
export const TERMINAL_STATES: readonly ConversationState[] = [
  'CREATE_COMPLAINT',
  'TICKET_CONFIRMATION',
  'COMPLETED',
  'CANCELLED',
  'HANDOFF_OR_ERROR',
];

export type CorrectableField = 'issue' | 'location' | 'name';

/** Details collected from the citizen. Values are always the citizen's own words. */
export interface CollectedFields {
  language: Language | null;
  issueText: string | null;
  categorySuggestion: string | null;
  locality: string | null;
  ward: string | null;
  landmark: string | null;
  citizenName: string | null;
}

/** Serializable engine state stored on the session row between turns. */
export interface ConversationContext {
  state: ConversationState;
  collected: CollectedFields;
  /** Consecutive failed attempts in the current step; reset whenever the step advances. */
  attempts: number;
  /** Set while the citizen is re-answering one field after rejecting the read-back. */
  correcting: CorrectableField | null;
  /** Name already held on the citizen record, used instead of asking again. */
  knownCitizenName: string | null;
}

export interface AssistantReply {
  text: string;
  /** Language the text is written in, when it differs from the conversation language. */
  language?: Language;
  /** Conversation step the utterance belongs to, shown in the transcript. */
  state: ConversationState;
}

export interface TurnResult {
  context: ConversationContext;
  /** Assistant utterances to persist and show/speak, in order. */
  replies: AssistantReply[];
  /**
   * `confirmed` is only emitted when the citizen explicitly answered "yes" to the read-back.
   * The engine never creates complaints; the session service acts on this signal.
   */
  event: 'none' | 'confirmed' | 'cancelled' | 'handoff';
}

/** Wording for one language. Placeholders use {name} syntax. */
export interface LanguageContent {
  greeting: string;
  disclosure: string;
  askIssue: string;
  clarifyIssue: string;
  askLocation: string;
  clarifyLocality: string;
  askLandmark: string;
  askName: string;
  clarifyName: string;
  readBack: string;
  readBackWard: string;
  readBackLandmark: string;
  askConfirmation: string;
  clarifyConfirmation: string;
  askCorrectionField: string;
  clarifyCorrectionField: string;
  ticketCreated: string;
  simulationNotice: string;
  cancelled: string;
  handoff: string;
  languageDefaulted: string;
  /** Asks the citizen, in this language, to pick a language (spoken with this language's voice). */
  chooseLanguage: string;
  /** Said when speech could not be recognised reliably. */
  didNotHear: string;
}

export interface QuestionnaireContent {
  defaultLanguage: Language;
  maxClarificationAttempts: number;
  /** Legacy single-line prompt from questionnaire v1; replaced by per-language chooseLanguage. */
  languagePrompt?: string;
  languages: Record<Language, LanguageContent>;
}

/**
 * Contract for anything that drives the conversation. Phase 4 ships a deterministic,
 * rule-based implementation; an LLM-backed implementation can replace it later without
 * touching session persistence or complaint creation.
 */
export interface DialogueEngine {
  readonly name: string;
  start(context: ConversationContext, content: QuestionnaireContent): TurnResult;
  respond(context: ConversationContext, content: QuestionnaireContent, text: string): TurnResult;
  didNotHear(context: ConversationContext, content: QuestionnaireContent): TurnResult;
  ticketMessages(
    context: ConversationContext,
    content: QuestionnaireContent,
    ticketId: string,
  ): TurnResult;
}
