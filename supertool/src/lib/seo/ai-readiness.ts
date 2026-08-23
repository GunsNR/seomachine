/**
 * Generative Engine Optimisation (GEO) scoring.
 *
 * Classic SEO scores a page for a ranking algorithm. This scores it for an
 * *answer* engine: the question is not "will this rank" but "will ChatGPT,
 * Perplexity, Claude, Gemini, Grok or Google AI Mode lift a passage from this
 * page and attribute it to us".
 *
 * The signals below are the ones that repeatedly separate cited pages from
 * uncited ones: extractable direct answers, hard numbers, named sources,
 * self-contained passages, explicit entities and machine-readable structure.
 */
import { countPhrase } from './keywords';
import { readability, sentences, toPlainText, words, round } from './text';

export interface AiSignal {
  id: string;
  label: string;
  /** 0-1 how well the page satisfies this signal. */
  score: number;
  weight: number;
  detail: string;
  fix: string;
}

export interface AiReadinessReport {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  signals: AiSignal[];
  quotablePassages: string[];
  extractedAnswer: string;
  stats: { statCount: number; citationCount: number; questionHeadings: number; listItems: number };
}

export interface AiReadinessInput {
  body: string;
  title?: string;
  headings?: string[];
  brand?: string;
  outboundLinks?: Array<{ href: string; text: string }>;
  schemaTypes?: string[];
  publishedAt?: Date | string | null;
  author?: string;
}

const STAT_RE = /\b\d[\d,.]*\s?(%|percent|x\b|million|billion|bn|k\b|m\b|users|customers|hours|days|weeks|months|years|seconds|minutes|\$)/gi;
const MONEY_RE = /\$\s?\d[\d,.]*/g;

const AUTHORITATIVE_TLD = /\.(gov|edu|org)(\/|$)/i;
const KNOWN_SOURCES = /(wikipedia|statista|gartner|forrester|mckinsey|pewresearch|nielsen|hubspot|semrush|ahrefs|moz\.com|search\.google|developers\.google|schema\.org|w3\.org|nist\.gov)/i;

/** Sentences that stand alone: they carry a claim and need no prior context. */
export function quotablePassages(body: string, limit = 5): string[] {
  const anaphora = /^(this|that|these|those|it|they|he|she|there|here|such|however|therefore|also|but|and|so|then|additionally|moreover|furthermore)\b/i;

  return sentences(body)
    .map((s) => s.trim())
    .filter((s) => {
      const wc = words(s).length;
      if (wc < 12 || wc > 45) return false;
      if (anaphora.test(s)) return false;
      if (s.endsWith(':')) return false;
      return true;
    })
    .map((s) => ({
      s,
      // Reward hard evidence and definitional phrasing.
      value:
        (s.match(STAT_RE)?.length ?? 0) * 3 +
        (s.match(MONEY_RE)?.length ?? 0) * 2 +
        (/\b(is|are|means|refers to|defined as|works by|consists of)\b/i.test(s) ? 2 : 0) +
        (/\baccording to\b/i.test(s) ? 2 : 0),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((c) => c.s);
}

/** The passage an answer engine would most plausibly lift as "the answer". */
export function extractAnswer(body: string): string {
  const first = sentences(body).slice(0, 4);
  const direct = first.find((s) => {
    const wc = words(s).length;
    return wc >= 15 && wc <= 60 && /\b(is|are|means|refers to|lets you|helps you|allows)\b/i.test(s);
  });
  return (direct ?? first[0] ?? '').trim();
}

export function scoreAiReadiness(input: AiReadinessInput): AiReadinessReport {
  const { body, title = '', headings = [], brand = '', outboundLinks = [], schemaTypes = [] } = input;
  const plain = toPlainText(body);
  const sents = sentences(body);
  const wordCount = words(body).length;

  const statMatches = plain.match(STAT_RE) ?? [];
  const moneyMatches = plain.match(MONEY_RE) ?? [];
  const statCount = statMatches.length + moneyMatches.length;

  const citations = outboundLinks.filter(
    (l) => AUTHORITATIVE_TLD.test(l.href) || KNOWN_SOURCES.test(l.href),
  );
  const attributions = (plain.match(/\baccording to\b|\bresearch (?:by|from)\b|\ba study\b|\bdata from\b/gi) ?? []).length;

  const questionHeadings = headings.filter(
    (h) => /\?$/.test(h.trim()) || /^(how|what|why|when|where|which|who|can|does|is|are|should|do)\b/i.test(h.trim()),
  ).length;

  const listItems = (body.match(/^\s*(?:[-*+]|\d+[.)])\s+/gm) ?? []).length;
  const tables = (body.match(/^\s*\|.+\|\s*$/gm) ?? []).length > 2 ? 1 : 0;

  const answer = extractAnswer(body);
  const passages = quotablePassages(body);

  const brandMentions = brand ? countPhrase(body, brand) + countPhrase(title, brand) : 0;
  const read = readability(body);

  const signals: AiSignal[] = [
    {
      id: 'direct-answer',
      label: 'Direct answer up front',
      weight: 16,
      score: answer ? Math.min(1, words(answer).length >= 15 ? 1 : 0.55) : 0,
      detail: answer ? `Opens with an extractable definition: "${truncate(answer, 110)}"` : 'No self-contained answer in the opening lines.',
      fix: 'Open with a 25-45 word sentence that answers the title question outright, before any preamble.',
    },
    {
      id: 'hard-numbers',
      label: 'Verifiable statistics',
      weight: 14,
      score: bandScore(statCount, [1, 3, 6, 10]),
      detail: `${statCount} quantified claim${statCount === 1 ? '' : 's'} found.`,
      fix: 'Add concrete figures (percentages, dollar amounts, timeframes). Answer engines preferentially quote sentences containing numbers.',
    },
    {
      id: 'sourcing',
      label: 'Named, authoritative sources',
      weight: 13,
      score: bandScore(citations.length + attributions, [1, 2, 4, 6]),
      detail: `${citations.length} authoritative outbound link${citations.length === 1 ? '' : 's'}, ${attributions} in-text attribution${attributions === 1 ? '' : 's'}.`,
      fix: 'Cite named primary sources inline ("According to <source>, ...") and link them. Models weight attributed claims far higher.',
    },
    {
      id: 'quotable',
      label: 'Self-contained passages',
      weight: 13,
      score: bandScore(passages.length, [1, 2, 4, 5]),
      detail: `${passages.length} passage${passages.length === 1 ? '' : 's'} readable without surrounding context.`,
      fix: 'Rewrite pronoun-led sentences ("This means...") so each claim stands alone when lifted out of the page.',
    },
    {
      id: 'question-structure',
      label: 'Question-shaped headings',
      weight: 12,
      score: headings.length ? Math.min(1, questionHeadings / Math.max(2, headings.length * 0.5)) : 0,
      detail: `${questionHeadings} of ${headings.length} headings phrased as a real query.`,
      fix: 'Rewrite H2s as the questions buyers actually type. Each heading + first paragraph should work as a standalone Q&A pair.',
    },
    {
      id: 'entity-clarity',
      label: 'Explicit entity naming',
      weight: 11,
      score: brand ? bandScore(brandMentions, [1, 2, 4, 7]) : 0.5,
      detail: brand
        ? `"${brand}" named ${brandMentions} time${brandMentions === 1 ? '' : 's'}.`
        : 'No brand entity supplied for this check.',
      fix: 'Name the brand explicitly beside its capabilities. Models attribute to entities they can name, not to "we" or "our platform".',
    },
    {
      id: 'structured-data',
      label: 'Machine-readable structure',
      weight: 8,
      score: Math.min(1, (schemaTypes.length ? 0.5 : 0) + (listItems >= 5 ? 0.3 : listItems >= 2 ? 0.15 : 0) + tables * 0.2),
      detail: `${schemaTypes.length ? schemaTypes.join(', ') : 'No schema'}; ${listItems} list items; ${tables ? 'table present' : 'no table'}.`,
      fix: 'Add FAQPage or Article JSON-LD, and convert dense paragraphs into lists or a comparison table.',
    },
    {
      id: 'depth',
      label: 'Topical depth',
      weight: 7,
      score: bandScore(wordCount, [400, 900, 1500, 2200]),
      detail: `${wordCount} words across ${sents.length} sentences.`,
      fix: 'Answer engines synthesise from comprehensive sources. Cover the adjacent sub-questions, not just the headline one.',
    },
    {
      id: 'clarity',
      label: 'Plain-language clarity',
      weight: 6,
      score: read.words ? clarityScore(read.fleschReadingEase) : 0,
      detail: `Flesch ${read.fleschReadingEase} (${read.label}), grade ${read.consensusGrade}.`,
      fix: 'Target Flesch 55-70. Dense prose is summarised away; clear prose is quoted verbatim.',
    },
  ];

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const raw = signals.reduce((s, x) => s + x.score * x.weight, 0);
  const score = Math.round((raw / totalWeight) * 100);

  return {
    score,
    grade: grade(score),
    signals: signals.map((s) => ({ ...s, score: round(s.score, 3) })),
    quotablePassages: passages,
    extractedAnswer: answer,
    stats: { statCount, citationCount: citations.length, questionHeadings, listItems },
  };
}

/** Map a raw count onto 0-1 using four ascending thresholds. */
function bandScore(value: number, [poor, fair, good, great]: number[]): number {
  if (value >= great) return 1;
  if (value >= good) return 0.8;
  if (value >= fair) return 0.55;
  if (value >= poor) return 0.3;
  return 0;
}

function clarityScore(ease: number): number {
  // Peak at 62.5; fall away symmetrically outside the 55-70 band.
  const target = 62.5;
  const distance = Math.abs(ease - target);
  if (distance <= 7.5) return 1;
  return Math.max(0, 1 - (distance - 7.5) / 32);
}

function grade(score: number): AiReadinessReport['grade'] {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}
