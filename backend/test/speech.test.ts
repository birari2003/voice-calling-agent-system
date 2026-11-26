import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ConversationStateError,
  DeterministicDialogueEngine,
  initialContext,
} from '../src/ai/deterministicDialogueEngine.js';
import { DEFAULT_QUESTIONNAIRE, withDefaultWording } from '../src/ai/questionnaireContent.js';
import {
  assessTranscription,
  looksHallucinated,
  matchesExpectedScript,
} from '../src/ai/speechGate.js';
import { parseLanguageChoice } from '../src/ai/textUnderstanding.js';
import type { QuestionnaireContent } from '../src/ai/types.js';

const engine = new DeterministicDialogueEngine();
const content = DEFAULT_QUESTIONNAIRE;

describe('speech confidence gate', () => {
  it('accepts confident speech', () => {
    assert.deepEqual(
      assessTranscription({ text: 'yes', confidence: 0.8, noSpeech: false, language: 'en' }, 0.4),
      {
        accepted: true,
      },
    );
  });
  it('rejects silence and empty text as no speech', () => {
    assert.deepEqual(
      assessTranscription({ text: '', confidence: 0.9, noSpeech: false, language: 'en' }, 0.4),
      {
        accepted: false,
        reason: 'no_speech',
      },
    );
    assert.deepEqual(
      assessTranscription({ text: 'hi', confidence: 0.9, noSpeech: true, language: 'en' }, 0.4),
      {
        accepted: false,
        reason: 'no_speech',
      },
    );
  });
  it('accepts a provider result without a confidence score, still checking script and garbling', () => {
    assert.deepEqual(
      assessTranscription(
        { text: 'हमारी गली में पानी नहीं आ रहा', confidence: null, noSpeech: false, language: 'hi' },
        0.4,
      ),
      { accepted: true },
    );
    assert.deepEqual(
      assessTranscription(
        { text: 'Garbage near school', confidence: null, noSpeech: false, language: 'hi' },
        0.4,
      ),
      { accepted: true },
      'Latin script is allowed for Hindi (mixed English words)',
    );
    assert.equal(
      assessTranscription(
        { text: 'నినారానిని తాన', confidence: null, noSpeech: false, language: 'hi' },
        0.4,
      ).accepted,
      false,
    );
  });

  it('rejects low-confidence speech so it never reaches the conversation', () => {
    assert.deepEqual(
      assessTranscription({ text: 'yes', confidence: 0.2, noSpeech: false, language: 'en' }, 0.4),
      {
        accepted: false,
        reason: 'low_confidence',
      },
    );
  });
});

describe('script check', () => {
  it('accepts replies in the expected script, including mixed English words', () => {
    assert.equal(matchesExpectedScript('हमारी गली में पानी नहीं आ रहा', 'hi'), true);
    assert.equal(matchesExpectedScript('আমাৰ ৰাস্তাৰ street light বেয়া', 'as'), true);
    assert.equal(matchesExpectedScript('Garbage not collected', 'en'), true);
  });

  it('rejects confident output in an unrelated script', () => {
    // A recognizer can occasionally return a confident transcript in an unrelated script.
    const telugu = 'వాధరావాయిని నినారానిని తాన ఆరినియారారింిరిది';
    assert.equal(matchesExpectedScript(telugu, 'as'), false);
    assert.deepEqual(
      assessTranscription({ text: telugu, confidence: 0.9, noSpeech: false, language: 'as' }, 0.4),
      { accepted: false, reason: 'low_confidence' },
    );
  });
});

describe('hallucination check', () => {
  it('rejects repetition loops and broken characters from speech recognition', () => {
    assert.equal(looksHallucinated('नहीं। नहीं। नहीं। नहीं। नहीं।'), true);
    assert.equal(looksHallucinated('अगर बज़़़़़़़़़़़'), true);
    assert.equal(looksHallucinated('अगर ब\uFFFD'), true);
  });
  it('accepts normal replies, including a short repeated answer', () => {
    assert.equal(looksHallucinated('हमारी गली में दो दिन से पानी नहीं आ रहा है'), false);
    assert.equal(looksHallucinated('no no'), false);
    assert.equal(looksHallucinated('Ward 111'), false);
  });
});

describe('voice-friendly conversation behaviour', () => {
  it('asks for the language once per language, each tagged for its own voice', () => {
    const turn = engine.start(initialContext(null, null), content);
    const prompts = turn.replies.filter((reply) => reply.state === 'LANGUAGE_SELECTION');
    assert.deepEqual(
      prompts.map((reply) => reply.language),
      ['as', 'hi', 'en'],
    );
  });

  it('accepts spoken number words as language choices', () => {
    assert.equal(parseLanguageChoice('two'), 'hi');
    assert.equal(parseLanguageChoice('दो'), 'hi');
    assert.equal(parseLanguageChoice('Three.'), 'en');
    assert.equal(parseLanguageChoice('এক'), 'as');
  });

  it('asks the citizen to repeat without changing the conversation step', () => {
    const started = engine.start(initialContext('Test Citizen', 'hi'), content);
    const repeat = engine.didNotHear(started.context, content);
    assert.equal(repeat.context.state, started.context.state);
    assert.equal(repeat.event, 'none');
    assert.equal(repeat.replies[0]!.text, content.languages.hi.didNotHear);
  });

  it('asks to repeat in every language before a language is chosen', () => {
    const started = engine.start(initialContext(null, null), content);
    const repeat = engine.didNotHear(started.context, content);
    assert.equal(repeat.replies.length, 3);
  });

  it('refuses to ask for a repeat after the conversation ended', () => {
    const started = engine.start(initialContext('Test Citizen', 'en'), content);
    const cancelled = engine.respond(started.context, content, 'stop');
    assert.throws(() => engine.didNotHear(cancelled.context, content), ConversationStateError);
  });
});

describe('stored questionnaire versions', () => {
  it('fills wording added after a version was stored, keeping stored text', () => {
    const stored = structuredClone(DEFAULT_QUESTIONNAIRE) as QuestionnaireContent;
    stored.languages.en.askIssue = 'Custom question?';
    delete (stored.languages.en as Partial<typeof stored.languages.en>).didNotHear;
    const merged = withDefaultWording(stored);
    assert.equal(merged.languages.en.askIssue, 'Custom question?');
    assert.equal(merged.languages.en.didNotHear, DEFAULT_QUESTIONNAIRE.languages.en.didNotHear);
  });
});
