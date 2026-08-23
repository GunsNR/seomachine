/**
 * Tokenisation and readability primitives.
 *
 * Everything downstream (keyword density, content scoring, AI-readiness)
 * builds on these, so they are deliberately dependency-free and deterministic.
 */

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e',
  'inc', 'ltd', 'co', 'corp', 'dept', 'est', 'fig', 'no', 'vol', 'approx',
]);

/** Strip HTML/markdown chrome so only prose is measured. */
export function toPlainText(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>*+-]+\s*/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(text: string): string[] {
  const matches = toPlainText(text)
    .toLowerCase()
    .match(/[a-z0-9]+(?:['’][a-z]+)?(?:-[a-z0-9]+)*/g);
  return matches ?? [];
}

/**
 * Split into sentences without breaking on common abbreviations or decimals
 * ("$1.5M", "e.g.") which would otherwise inflate the sentence count and make
 * every text look artificially readable.
 */
export function sentences(text: string): string[] {
  const plain = toPlainText(text);
  if (!plain) return [];

  const out: string[] = [];
  let buffer = '';

  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    buffer += ch;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    const next = plain[i + 1];
    // A terminator only ends a sentence when whitespace (or EOS) follows.
    if (next && next !== ' ') continue;

    const tail = buffer.trimEnd();
    const lastToken = tail.slice(0, -1).split(/[\s(]/).pop()?.toLowerCase() ?? '';

    if (ch === '.') {
      if (ABBREVIATIONS.has(lastToken.replace(/[^a-z.]/g, ''))) continue;
      // Single initial, e.g. "J. Smith".
      if (/^[a-z]$/.test(lastToken)) continue;
      // Decimal number: digit before the dot and after the space-less next char.
      if (/\d$/.test(lastToken) && /^\d/.test(plain.slice(i + 1).trim())) continue;
    }

    out.push(tail);
    buffer = '';
  }

  const rest = buffer.trim();
  if (rest) out.push(rest);
  return out.filter((s) => /[a-z0-9]/i.test(s));
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => toPlainText(p))
    .filter((p) => p.length > 0);
}

const VOWELS = 'aeiouy';

/**
 * Syllable estimate tuned for the Flesch family of formulas.
 *
 * Two English spelling rules do most of the work: a trailing "e" is silent
 * unless it forms a consonant+le cluster ("table"), and the -es/-ed suffixes
 * are only their own syllable after a sibilant ("watches") or a t/d ("wanted").
 */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;

  if (
    /[^aeiouy](?:es|ed)$/.test(w) &&
    !/(?:[sxz]|ch|sh)es$/.test(w) &&
    !/[td]ed$/.test(w)
  ) {
    w = w.slice(0, -2);
  }

  if (/e$/.test(w) && !/[^aeiouy]le$/.test(w)) w = w.slice(0, -1);
  if (!w) return 1;

  let count = 0;
  let prevWasVowel = false;
  for (const ch of w) {
    const isVowel = VOWELS.includes(ch);
    if (isVowel && !prevWasVowel) count++;
    prevWasVowel = isVowel;
  }

  return Math.max(1, count);
}

export interface ReadabilityReport {
  words: number;
  sentences: number;
  syllables: number;
  complexWords: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  /** Flesch Reading Ease, 0-100. Higher is easier. */
  fleschReadingEase: number;
  /** US school grade required to read the text comfortably. */
  fleschKincaidGrade: number;
  gunningFog: number;
  smog: number;
  automatedReadabilityIndex: number;
  /** Mean of the grade-level formulas. */
  consensusGrade: number;
  label: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function readability(text: string): ReadabilityReport {
  const w = words(text);
  const s = sentences(text);
  const wordCount = w.length;
  const sentenceCount = Math.max(1, s.length);

  if (wordCount === 0) {
    return {
      words: 0, sentences: 0, syllables: 0, complexWords: 0,
      avgWordsPerSentence: 0, avgSyllablesPerWord: 0,
      fleschReadingEase: 0, fleschKincaidGrade: 0, gunningFog: 0,
      smog: 0, automatedReadabilityIndex: 0, consensusGrade: 0,
      label: 'No content',
    };
  }

  let syllableTotal = 0;
  let complexWords = 0;
  let letters = 0;
  for (const word of w) {
    const syl = syllables(word);
    syllableTotal += syl;
    if (syl >= 3) complexWords++;
    letters += word.replace(/[^a-z0-9]/g, '').length;
  }

  const wps = wordCount / sentenceCount;
  const spw = syllableTotal / wordCount;

  const fleschReadingEase = clamp(206.835 - 1.015 * wps - 84.6 * spw, 0, 100);
  const fleschKincaidGrade = Math.max(0, 0.39 * wps + 11.8 * spw - 15.59);
  const gunningFog = Math.max(0, 0.4 * (wps + 100 * (complexWords / wordCount)));
  // SMOG is defined over 30 sentences; scale the polysyllable count to match.
  const smog = Math.max(0, 1.043 * Math.sqrt(complexWords * (30 / sentenceCount)) + 3.1291);
  const automatedReadabilityIndex = Math.max(
    0,
    4.71 * (letters / wordCount) + 0.5 * wps - 21.43,
  );

  const consensusGrade =
    (fleschKincaidGrade + gunningFog + smog + automatedReadabilityIndex) / 4;

  return {
    words: wordCount,
    sentences: s.length,
    syllables: syllableTotal,
    complexWords,
    avgWordsPerSentence: round(wps, 2),
    avgSyllablesPerWord: round(spw, 2),
    fleschReadingEase: round(fleschReadingEase, 1),
    fleschKincaidGrade: round(fleschKincaidGrade, 1),
    gunningFog: round(gunningFog, 1),
    smog: round(smog, 1),
    automatedReadabilityIndex: round(automatedReadabilityIndex, 1),
    consensusGrade: round(consensusGrade, 1),
    label: easeLabel(fleschReadingEase),
  };
}

export function easeLabel(ease: number): string {
  if (ease >= 90) return 'Very easy';
  if (ease >= 80) return 'Easy';
  if (ease >= 70) return 'Fairly easy';
  if (ease >= 60) return 'Plain English';
  if (ease >= 50) return 'Fairly difficult';
  if (ease >= 30) return 'Difficult';
  return 'Very difficult';
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
