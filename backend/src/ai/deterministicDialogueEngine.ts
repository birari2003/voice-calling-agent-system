import {
  classifyYesNo,
  cleanFreeText,
  extractName,
  isCancelRequest,
  isRelevantIssue,
  isRelevantLandmark,
  isRelevantLocation,
  isSkip,
  isUsableLocality,
  parseCorrectionField,
  parseLanguageChoice,
  parseLocation,
  suggestCategory,
} from './textUnderstanding.js';
import {
  LANGUAGES,
  TERMINAL_STATES,
  type AssistantReply,
  type CollectedFields,
  type ConversationContext,
  type ConversationState,
  type DialogueEngine,
  type Language,
  type LanguageContent,
  type QuestionnaireContent,
  type TurnResult,
} from './types.js';

export class ConversationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversationStateError';
  }
}

export function initialContext(
  knownCitizenName: string | null,
  presetLanguage: Language | null,
): ConversationContext {
  const collected: CollectedFields = {
    language: presetLanguage,
    issueText: null,
    categorySuggestion: null,
    locality: null,
    ward: null,
    landmark: null,
    citizenName: knownCitizenName?.trim() || null,
  };
  return {
    state: 'INITIAL',
    collected,
    attempts: 0,
    correcting: null,
    knownCitizenName: knownCitizenName?.trim() || null,
  };
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
}

function wording(context: ConversationContext, content: QuestionnaireContent): LanguageContent {
  return content.languages[context.collected.language ?? content.defaultLanguage];
}

function cloneContext(context: ConversationContext): ConversationContext {
  return { ...context, collected: { ...context.collected } };
}

/**
 * Rule-based dialogue engine. It is deterministic so the whole complaint flow can be tested
 * without speech or LLM models. It only proposes the next utterance and state; it never
 * creates complaints. `confirmed` is emitted solely for an explicit "yes" to the read-back.
 */
export class DeterministicDialogueEngine implements DialogueEngine {
  readonly name = 'deterministic-text-v1';

  start(context: ConversationContext, content: QuestionnaireContent): TurnResult {
    if (context.state !== 'INITIAL')
      throw new ConversationStateError('The conversation has already started.');
    const next = cloneContext(context);
    const text = wording(next, content);
    const replies: AssistantReply[] = [
      { text: text.greeting, state: 'DISCLOSURE' },
      { text: text.disclosure, state: 'DISCLOSURE' },
    ];
    if (next.collected.language) return this.advance(next, content, replies);
    next.state = 'LANGUAGE_SELECTION';
    replies.push(...this.languagePrompts(content));
    return { context: next, replies, event: 'none' };
  }

  respond(context: ConversationContext, content: QuestionnaireContent, input: string): TurnResult {
    if (context.state === 'INITIAL')
      throw new ConversationStateError('Start the conversation before sending messages.');
    if (TERMINAL_STATES.includes(context.state))
      throw new ConversationStateError('This conversation has already finished.');
    const next = cloneContext(context);
    if (isCancelRequest(input)) {
      next.state = 'CANCELLED';
      next.correcting = null;
      return {
        context: next,
        replies: [{ text: wording(next, content).cancelled, state: 'CANCELLED' }],
        event: 'cancelled',
      };
    }
    switch (next.state) {
      case 'LANGUAGE_SELECTION':
        return this.handleLanguage(next, content, input);
      case 'ASK_ISSUE':
      case 'CLARIFY_ISSUE':
        return this.handleIssue(next, content, input);
      case 'ASK_LOCATION':
        return this.handleLocation(next, content, input);
      case 'CLARIFY_LOCATION':
        return next.collected.locality
          ? this.handleLandmark(next, content, input)
          : this.handleLocation(next, content, input);
      case 'ASK_NAME':
        return this.handleName(next, content, input);
      case 'AWAIT_CONFIRMATION':
        return this.handleConfirmation(next, content, input);
      case 'ASK_CORRECTION_FIELD':
        return this.handleCorrectionChoice(next, content, input);
      default:
        throw new ConversationStateError(`Cannot accept input in state ${next.state}.`);
    }
  }

  ticketMessages(
    context: ConversationContext,
    content: QuestionnaireContent,
    ticketId: string,
  ): TurnResult {
    if (context.state !== 'CREATE_COMPLAINT')
      throw new ConversationStateError('A ticket can only be announced after confirmation.');
    const next = cloneContext(context);
    const text = wording(next, content);
    next.state = 'COMPLETED';
    return {
      context: next,
      replies: [
        { text: fill(text.ticketCreated, { ticketId }), state: 'TICKET_CONFIRMATION' },
        { text: text.simulationNotice, state: 'TICKET_CONFIRMATION' },
      ],
      event: 'none',
    };
  }

  /** One prompt per language, each tagged so it can be spoken with that language's voice. */
  private languagePrompts(content: QuestionnaireContent): AssistantReply[] {
    return LANGUAGES.map((language) => ({
      text: content.languages[language].chooseLanguage,
      state: 'LANGUAGE_SELECTION' as const,
      language,
    }));
  }

  /** Asks the citizen to repeat after unreliable speech recognition; does not change state. */
  didNotHear(context: ConversationContext, content: QuestionnaireContent): TurnResult {
    if (context.state === 'INITIAL' || TERMINAL_STATES.includes(context.state))
      throw new ConversationStateError('This conversation is not waiting for input.');
    const next = cloneContext(context);
    if (next.state === 'LANGUAGE_SELECTION')
      return {
        context: next,
        replies: [
          ...LANGUAGES.map((language) => ({
            text: content.languages[language].didNotHear,
            state: next.state,
            language,
          })),
        ],
        event: 'none',
      };
    return {
      context: next,
      replies: [{ text: wording(next, content).didNotHear, state: next.state }],
      event: 'none',
    };
  }

  /** Records a failed attempt and either re-asks or hands off once the limit is passed. */
  private retry(
    context: ConversationContext,
    content: QuestionnaireContent,
    state: ConversationState,
    prompt: string,
  ): TurnResult {
    context.attempts += 1;
    if (context.attempts > content.maxClarificationAttempts) {
      context.state = 'HANDOFF_OR_ERROR';
      context.correcting = null;
      return {
        context,
        replies: [{ text: wording(context, content).handoff, state: 'HANDOFF_OR_ERROR' }],
        event: 'handoff',
      };
    }
    context.state = state;
    return { context, replies: [{ text: prompt, state }], event: 'none' };
  }

  /** Moves to the first missing detail, or to the read-back once everything is collected. */
  private advance(
    context: ConversationContext,
    content: QuestionnaireContent,
    replies: AssistantReply[] = [],
  ): TurnResult {
    context.attempts = 0;
    const text = wording(context, content);
    const { collected } = context;
    let state: ConversationState;
    if (!collected.issueText) {
      state = 'ASK_ISSUE';
      replies.push({ text: text.askIssue, state });
    } else if (!collected.locality) {
      state = 'ASK_LOCATION';
      replies.push({ text: text.askLocation, state });
    } else if (!collected.citizenName) {
      state = 'ASK_NAME';
      replies.push({ text: text.askName, state });
    } else {
      context.correcting = null;
      state = 'AWAIT_CONFIRMATION';
      replies.push(
        { text: this.readBack(context, content), state: 'READ_BACK' },
        { text: text.askConfirmation, state },
      );
    }
    context.state = state;
    return { context, replies, event: 'none' };
  }

  private readBack(context: ConversationContext, content: QuestionnaireContent): string {
    const text = wording(context, content);
    const { collected } = context;
    return fill(text.readBack, {
      issue: collected.issueText ?? '',
      locality: collected.locality ?? '',
      ward: collected.ward ? fill(text.readBackWard, { ward: collected.ward }) : '',
      landmark: collected.landmark
        ? fill(text.readBackLandmark, { landmark: collected.landmark })
        : '',
      name: collected.citizenName ?? '',
    });
  }

  private handleLanguage(
    context: ConversationContext,
    content: QuestionnaireContent,
    input: string,
  ): TurnResult {
    const choice = parseLanguageChoice(input);
    if (choice) {
      context.collected.language = choice;
      const replies: AssistantReply[] = [];
      // The disclosure was given in the default language; repeat it in the chosen one.
      if (choice !== content.defaultLanguage)
        replies.push({ text: content.languages[choice].disclosure, state: 'DISCLOSURE' });
      return this.advance(context, content, replies);
    }
    context.attempts += 1;
    if (context.attempts > content.maxClarificationAttempts) {
      context.collected.language = content.defaultLanguage;
      return this.advance(context, content, [
        {
          text: content.languages[content.defaultLanguage].languageDefaulted,
          state: 'LANGUAGE_SELECTION',
        },
      ]);
    }
    return { context, replies: this.languagePrompts(content), event: 'none' };
  }

  private handleIssue(
    context: ConversationContext,
    content: QuestionnaireContent,
    input: string,
  ): TurnResult {
    if (!isRelevantIssue(input))
      return this.retry(context, content, 'CLARIFY_ISSUE', wording(context, content).clarifyIssue);
    const issueText = cleanFreeText(input, 2000);
    context.collected.issueText = issueText;
    context.collected.categorySuggestion = suggestCategory(issueText);
    return this.advance(context, content);
  }

  private handleLocation(
    context: ConversationContext,
    content: QuestionnaireContent,
    input: string,
  ): TurnResult {
    if (!isRelevantLocation(input))
      return this.retry(
        context,
        content,
        'CLARIFY_LOCATION',
        wording(context, content).clarifyLocality,
      );
    const parsed = parseLocation(input);
    const { collected } = context;
    if (parsed.ward) collected.ward = parsed.ward;
    if (parsed.landmark) collected.landmark = parsed.landmark;
    if (!isUsableLocality(parsed.locality))
      return this.retry(
        context,
        content,
        'CLARIFY_LOCATION',
        wording(context, content).clarifyLocality,
      );
    collected.locality = parsed.locality;
    if (!collected.landmark) {
      context.attempts = 0;
      context.state = 'CLARIFY_LOCATION';
      return {
        context,
        replies: [{ text: wording(context, content).askLandmark, state: 'CLARIFY_LOCATION' }],
        event: 'none',
      };
    }
    return this.advance(context, content);
  }

  private handleLandmark(
    context: ConversationContext,
    content: QuestionnaireContent,
    input: string,
  ): TurnResult {
    if (!isRelevantLandmark(input))
      return this.retry(
        context,
        content,
        'CLARIFY_LOCATION',
        wording(context, content).askLandmark,
      );
    if (isSkip(input)) {
      // A skipped landmark is an explicit empty answer. Clear any stale value so words such as
      // "छोड़ें" can never appear as, or preserve, a landmark in the following read-back.
      context.collected.landmark = null;
    } else {
      const parsed = parseLocation(input);
      if (parsed.ward && !context.collected.ward) context.collected.ward = parsed.ward;
      const landmark = parsed.landmark ?? parsed.locality ?? null;
      context.collected.landmark = landmark ? cleanFreeText(landmark, 160) : null;
    }
    return this.advance(context, content);
  }

  private handleName(
    context: ConversationContext,
    content: QuestionnaireContent,
    input: string,
  ): TurnResult {
    const name = extractName(input);
    if (!name)
      return this.retry(context, content, 'ASK_NAME', wording(context, content).clarifyName);
    context.collected.citizenName = name;
    return this.advance(context, content);
  }

  private handleConfirmation(
    context: ConversationContext,
    content: QuestionnaireContent,
    input: string,
  ): TurnResult {
    const answer = classifyYesNo(input);
    if (answer === 'yes') {
      context.state = 'CREATE_COMPLAINT';
      context.attempts = 0;
      return { context, replies: [], event: 'confirmed' };
    }
    if (answer === 'no') {
      context.attempts = 0;
      context.state = 'ASK_CORRECTION_FIELD';
      return {
        context,
        replies: [
          { text: wording(context, content).askCorrectionField, state: 'ASK_CORRECTION_FIELD' },
        ],
        event: 'none',
      };
    }
    return this.retry(
      context,
      content,
      'AWAIT_CONFIRMATION',
      wording(context, content).clarifyConfirmation,
    );
  }

  private handleCorrectionChoice(
    context: ConversationContext,
    content: QuestionnaireContent,
    input: string,
  ): TurnResult {
    const field = parseCorrectionField(input);
    if (!field)
      return this.retry(
        context,
        content,
        'ASK_CORRECTION_FIELD',
        wording(context, content).clarifyCorrectionField,
      );
    const { collected } = context;
    context.correcting = field;
    if (field === 'issue') {
      collected.issueText = null;
      collected.categorySuggestion = null;
    } else if (field === 'location') {
      collected.locality = null;
      collected.ward = null;
      collected.landmark = null;
    } else {
      collected.citizenName = null;
    }
    return this.advance(context, content);
  }
}

export const dialogueEngine = new DeterministicDialogueEngine();
