import type { TranscriptionResult } from './speech.js';
import type { Language } from './types.js';

export type SpeechAssessment =
  { accepted: true } | { accepted: false; reason: 'no_speech' | 'low_confidence' };

/**
 * Scripts a reply may be written in. Latin is allowed for every language because citizens mix
 * English words and digits into Assamese and Hindi speech.
 */
const SCRIPT_PATTERNS: Record<Language, RegExp> = {
  as: /[ঀ-৿A-Za-z]/u,
  hi: /[ऀ-ॿA-Za-z]/u,
  en: /[A-Za-z]/u,
};
const MIN_SCRIPT_SHARE = 0.6;

/**
 * True when most letters are in the expected script. Recognisers sometimes return confident
 * text in an unrelated script (for example Telugu for Assamese audio); that is never usable.
 */
export function matchesExpectedScript(text: string, language: Language): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  const expected = letters.filter((letter) => SCRIPT_PATTERNS[language].test(letter)).length;
  return expected / letters.length >= MIN_SCRIPT_SHARE;
}

/**
 * Detects typical recogniser hallucinations: replacement characters, one character repeated
 * many times ("बज़़़़़"), or the same word repeated in a row ("नहीं नहीं नहीं नहीं").
 */
export function looksHallucinated(text: string): boolean {
  if (text.includes('\uFFFD')) return true;
  if (/(\S)\1{4,}/u.test(text.replace(/\s+/g, ''))) return true;
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{M}\p{N}]/gu, ''))
    .filter(Boolean);
  let run = 1;
  for (let index = 1; index < words.length; index += 1) {
    run = words[index] === words[index - 1] ? run + 1 : 1;
    if (run >= 4) return true;
  }
  return false;
}

/** Decides whether a transcription is reliable enough to feed into the conversation. */
export function assessTranscription(
  result: Pick<TranscriptionResult, 'text' | 'confidence' | 'noSpeech' | 'language'>,
  minConfidence: number,
): SpeechAssessment {
  if (result.noSpeech || !result.text.trim()) return { accepted: false, reason: 'no_speech' };
  // A null confidence means the provider gives no score: rely on the checks below and the
  // read-back instead of inventing a number.
  if (result.confidence !== null && result.confidence < minConfidence)
    return { accepted: false, reason: 'low_confidence' };
  if (!matchesExpectedScript(result.text, result.language) || looksHallucinated(result.text))
    return { accepted: false, reason: 'low_confidence' };
  return { accepted: true };
}
