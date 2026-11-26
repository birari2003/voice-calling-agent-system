/**
 * Deterministic text understanding for the Phase 4 text-mode engine. Nothing here guesses or
 * fills in details: values are either taken from the citizen's words or left empty.
 */
import type { CorrectableField, Language } from './types.js';

const NATIVE_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
};

export function toAsciiDigits(text: string): string {
  return text.replace(/[০-৯०-९]/g, (digit) => NATIVE_DIGITS[digit] ?? digit);
}

/**
 * Lowercases, unifies digits, removes punctuation and collapses whitespace. Combining marks
 * (\p{M}) are kept because Devanagari and Bengali-Assamese vowel signs are marks.
 */
export function normalize(text: string): string {
  return toAsciiDigits(text.normalize('NFC').toLowerCase())
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordSet(words: string[]): Set<string> {
  return new Set(words.map(normalize));
}

const CANCEL_WORDS = keywordSet([
  'stop',
  'cancel',
  'quit',
  'exit',
  'end call',
  'stop please',
  'ruko',
  'band karo',
  'radd karo',
  'रुको',
  'रुकें',
  'बंद करो',
  'रद्द',
  'रद्द करो',
  'bondho',
  'batil',
  'বন্ধ',
  'বন্ধ কৰক',
  'বাতিল',
  'বাতিল কৰক',
]);
const YES_WORDS = keywordSet([
  'yes',
  'y',
  'yeah',
  'yep',
  'correct',
  'right',
  'ok',
  'okay',
  'confirm',
  'confirmed',
  'haan',
  'han',
  'haa',
  'ha',
  'ji',
  'ji haan',
  'sahi',
  'हाँ',
  'हां',
  'हा',
  'जी',
  'जी हाँ',
  'जी हां',
  'सही',
  'hoi',
  'hoy',
  'হয়',
  'ঠিক',
  'শুদ্ধ',
  'ঠিক আছে',
]);
const NO_WORDS = keywordSet([
  'no',
  'n',
  'nope',
  'wrong',
  'incorrect',
  'not correct',
  'nahi',
  'nahin',
  'galat',
  'नहीं',
  'नही',
  'ना',
  'गलत',
  'ग़लत',
  'nohoi',
  'nohoy',
  'নহয়',
  'না',
  'ভুল',
]);
const SKIP_WORDS = keywordSet([
  'skip',
  'none',
  'no',
  'nothing',
  'no landmark',
  'nahi',
  'chhodo',
  'छोड़ें',
  'छोड़े',
  'छोड़ो',
  'छोड़िए',
  'छोड़ दीजिए',
  'रहने दें',
  'कोई नहीं',
  'नहीं',
  'bad diyok',
  'বাদ দিয়ক',
  'বাদ',
  'নাই',
  'নহয়',
]);

const LANGUAGE_WORDS: Record<Language, Set<string>> = {
  // Spoken replies arrive as words ("two", "दो"), so number words count as choices too.
  as: keywordSet(['1', 'one', 'ek', 'एक', 'এক', 'assamese', 'asamiya', 'axomiya', 'অসমীয়া']),
  hi: keywordSet(['2', 'two', 'दो', 'দুই', 'hindi', 'हिंदी', 'हिन्दी']),
  en: keywordSet([
    '3',
    'three',
    'teen',
    'तीन',
    'তিনি',
    'english',
    'angrezi',
    'अंग्रेज़ी',
    'अंग्रेजी',
    'ইংৰাজী',
  ]),
};

const CORRECTION_WORDS: Record<CorrectableField, Set<string>> = {
  issue: keywordSet(['1', 'problem', 'issue', 'complaint', 'samasya', 'समस्या', 'শিকায়ত', 'সমস্যা']),
  location: keywordSet([
    '2',
    'location',
    'place',
    'address',
    'area',
    'sthan',
    'jagah',
    'स्थान',
    'जगह',
    'ঠাই',
  ]),
  name: keywordSet(['3', 'name', 'naam', 'नाम', 'নাম']),
};

function tokens(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

/** True only when the whole message is a stop/cancel phrase, so "the bus stop light is broken" is not a cancel. */
export function isCancelRequest(text: string): boolean {
  return CANCEL_WORDS.has(normalize(text));
}

export function isSkip(text: string): boolean {
  return SKIP_WORDS.has(normalize(text));
}

/**
 * True when the whole reply is only a yes/no/skip word (for example a quick-reply button or a
 * one-word spoken answer). Such replies are never valid as a location or a name.
 */
export function isControlReply(text: string): boolean {
  const whole = normalize(text);
  return YES_WORDS.has(whole) || NO_WORDS.has(whole) || SKIP_WORDS.has(whole);
}

export type YesNo = 'yes' | 'no' | 'unclear';

/**
 * Classifies a reply to the read-back question. A reply counts as "yes" only when the whole
 * message is an affirmative phrase, or it starts with one and contains no negative word.
 * Anything else is "unclear" and the question is asked again.
 */
export function classifyYesNo(text: string): YesNo {
  const whole = normalize(text);
  if (!whole) return 'unclear';
  if (YES_WORDS.has(whole)) return 'yes';
  if (NO_WORDS.has(whole)) return 'no';
  const words = tokens(text);
  const hasNo = words.some((word) => NO_WORDS.has(word));
  const hasYes = words.some((word) => YES_WORDS.has(word));
  if (hasYes && hasNo) return 'unclear';
  if (YES_WORDS.has(words[0]!) && !hasNo) return 'yes';
  if (NO_WORDS.has(words[0]!) && !hasYes) return 'no';
  return 'unclear';
}

function matchSingle<T extends string>(text: string, table: Record<T, Set<string>>): T | null {
  const whole = normalize(text);
  const words = new Set(tokens(text));
  const matches = (Object.keys(table) as T[]).filter(
    (key) => table[key].has(whole) || [...words].some((word) => table[key].has(word)),
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function parseLanguageChoice(text: string): Language | null {
  return matchSingle(text, LANGUAGE_WORDS);
}

export function parseCorrectionField(text: string): CorrectableField | null {
  return matchSingle(text, CORRECTION_WORDS);
}

function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length;
}

/** An issue must be specific enough for staff to act on: at least 10 characters and 3 words. */
export function isSpecificIssue(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 10 && letterCount(trimmed) >= 6 && tokens(trimmed).length >= 3;
}

const ISSUE_SIGNAL = new RegExp(
  [
    'problem',
    'issue',
    'complaint',
    'broken',
    'damaged',
    'leak',
    'overflow',
    'blocked',
    'garbage',
    'waste',
    'pothole',
    'noise',
    'light',
    'electricity',
    'power',
    'not working',
    'power cut',
    'no water',
    'समस्या',
    'शिकायत',
    'खराब',
    'टूट',
    'लीक',
    'भरा',
    'जाम',
    'कचरा',
    'गड्ढा',
    'पानी',
    'नहीं',
    'लाइट',
    'बिजली',
    'चली गई',
    'बंद',
    'সমস্যা',
    'অভিযোগ',
    'বেয়া',
    'ভাঙ',
    'পানী',
    'জাবৰ',
    'আবৰ্জনা',
    'গাঁত',
    'নাই',
  ].join('|'),
  'iu',
);

const NAME_ANSWER_PREFIX = new RegExp(
  String.raw`^(?:my name is|name is|i am|this is|मेरा नाम|नाम|मैं|मुझे कहते हैं|মোৰ নাম|মই)(?:\s|$)`,
  'iu',
);

/** Conservative state guards: reject obvious answers to a different question. */
export function isRelevantIssue(text: string): boolean {
  const value = normalize(text);
  return (
    isSpecificIssue(text) &&
    !isControlReply(text) &&
    !NAME_ANSWER_PREFIX.test(value) &&
    ISSUE_SIGNAL.test(value)
  );
}

export function isRelevantLocation(text: string): boolean {
  const value = normalize(text);
  return !isControlReply(text) && !NAME_ANSWER_PREFIX.test(value) && !ISSUE_SIGNAL.test(value);
}

export function isRelevantLandmark(text: string): boolean {
  if (isSkip(text)) return true;
  return isRelevantLocation(text) && tokens(text).length <= 8;
}

export function cleanFreeText(text: string, maxLength: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  [
    'Drainage',
    [
      'drain',
      'sewer',
      'sewage',
      'waterlogging',
      'water logging',
      'nala',
      'naali',
      'नाली',
      'नाला',
      'सीवर',
      'নলা',
      'নলাৰ',
      'নৰ্দমা',
    ],
  ],
  [
    'Waste Management',
    [
      'garbage',
      'waste',
      'trash',
      'rubbish',
      'dustbin',
      'kachra',
      'kooda',
      'कचरा',
      'कूड़ा',
      'कूड़ेदान',
      'আবৰ্জনা',
      'জাবৰ',
    ],
  ],
  ['Water Supply', ['water', 'pipe', 'leak', 'tap', 'pani', 'पानी', 'पाइप', 'नल', 'পানী', 'নল']],
  [
    'Street Lighting',
    ['streetlight', 'street light', 'lamp', 'light', 'batti', 'बत्ती', 'लाइट', 'লাইট', 'বাতি'],
  ],
  ['Roads', ['pothole', 'road', 'footpath', 'gaddha', 'गड्ढा', 'सड़क', 'ৰাস্তা', 'পথ', 'গাঁত']],
  ['Public Health', ['mosquito', 'stray', 'dead animal', 'मच्छर', 'আঁহ', 'মহ']],
];

/** Keyword-based category hint. It is a suggestion for staff, not a decision; defaults to "General". */
export function suggestCategory(issueText: string): string {
  const text = issueText.normalize('NFC').toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword.normalize('NFC')))) return category;
  }
  return 'General';
}

export interface ParsedLocation {
  locality: string | null;
  ward: string | null;
  landmark: string | null;
}

/** Builds a regex from NFC-normalized source so it matches NFC-normalized input (nukta letters). */
function nfcRegex(source: string, flags: string): RegExp {
  return new RegExp(source.normalize('NFC'), flags);
}

const WARD_PATTERN = nfcRegex(
  String.raw`(?:ward|वार्ड|वॉर्ड|ৱাৰ্ড|ওৱাৰ্ড)\s*(?:no\.?|number|नंबर|नं\.?|নং|নম্বৰ)?\s*[:#-]?\s*(\d{1,3})`,
  'iu',
);
const EN_LANDMARK_PATTERN = /\b(?:near|opposite|behind|beside|next to)\s+([^,;.।]+)/i;
const POSTPOSITION_LANDMARK_PATTERN = nfcRegex(
  String.raw`([^,;.।]+?)\s*(?:के पास|के सामने|के पीछे|ৰ ওচৰত|ওচৰত|ৰ সন্মুখত)`,
  'u',
);

/**
 * Splits a spoken/typed location into locality, ward and landmark. Only text the citizen
 * actually said is used; anything not recognised stays in the locality.
 */
export function parseLocation(raw: string): ParsedLocation {
  let text = toAsciiDigits(raw.normalize('NFC').trim());
  let ward: string | null = null;
  let landmark: string | null = null;

  const wardMatch = text.match(WARD_PATTERN);
  if (wardMatch) {
    ward = String(Number(wardMatch[1]));
    text = text.replace(wardMatch[0], ' ');
  }
  const landmarkMatch =
    text.match(EN_LANDMARK_PATTERN) ?? text.match(POSTPOSITION_LANDMARK_PATTERN);
  if (landmarkMatch) {
    landmark = cleanFreeText(landmarkMatch[1]!, 160) || null;
    text = text.replace(landmarkMatch[0], ' ');
  }
  const locality = text
    .split(/[,;।]+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => letterCount(part) > 0)
    .join(', ');
  return { locality: locality ? locality.slice(0, 160) : null, ward, landmark };
}

export function isUsableLocality(text: string | null): boolean {
  return !!text && letterCount(text) >= 2 && !isControlReply(text);
}

const NAME_PREFIX = nfcRegex(
  String.raw`^(?:my name is|name is|i am|this is|मेरा नाम|नाम|मैं|মোৰ নাম|মই)\s+`,
  'iu',
);
const NAME_SUFFIX = nfcRegex(String.raw`\s+(?:है|हूँ|हूं|হয়)$`, 'u');

/** Returns the citizen's name with framing words removed, or null if it does not look like a name. */
export function extractName(raw: string): string | null {
  const name = cleanFreeText(raw.normalize('NFC'), 120)
    .replace(/[.!?।]+$/u, '')
    .replace(NAME_PREFIX, '')
    .replace(NAME_SUFFIX, '')
    .trim();
  if (
    name.length < 2 ||
    name.length > 80 ||
    tokens(name).length > 5 ||
    isControlReply(name) ||
    ISSUE_SIGNAL.test(normalize(name))
  )
    return null;
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u.test(name)) return null;
  return letterCount(name) >= 2 ? name : null;
}
