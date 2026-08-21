/**
 * Content brief generation.
 *
 * A brief is only useful if it says something the writer did not already know,
 * so this is built from the project's own measured data rather than a template:
 * the prompts an engine failed to name you on, the competitor URLs that took
 * those citations, the keyword's difficulty and intent, and the terms that
 * actually co-occur in the topic.
 */
import { classifyIntent } from './keywords';
import { round } from './text';

export interface BriefInput {
  /** The keyword the piece targets. */
  targetKeyword: string;
  volume: number;
  difficulty: number;
  intent?: string;
  /** Prompts in this topic where the brand is not currently named. */
  unansweredPrompts: string[];
  /** Competitor URLs cited on those prompts. */
  competingUrls: string[];
  /** Related keywords in the same cluster, to weave in as secondary terms. */
  relatedKeywords: Array<{ phrase: string; volume: number }>;
  /** Word counts of pages already ranking, when known. */
  competitorWordCounts?: number[];
  brand: string;
}

export interface ContentBrief {
  topic: string;
  targetKeyword: string;
  intent: string;
  /** Recommended length, benchmarked against the ranking set where available. */
  targetWords: number;
  benchmark: { median: number; basis: 'serp' | 'intent-default' };
  /** H2s, in the order they should appear. */
  outline: Array<{ heading: string; guidance: string }>;
  /** Questions the piece must answer outright to be citable. */
  questions: string[];
  secondaryKeywords: string[];
  competingUrls: string[];
  /** Concrete requirements the GEO scorer will check for. */
  requirements: string[];
  /** The opening sentence pattern that gets lifted into an AI answer. */
  answerTemplate: string;
}

/** Length targets by intent, used when no ranking data is available. */
const INTENT_LENGTH: Record<string, number> = {
  transactional: 1200,
  commercial: 1800,
  informational: 2000,
  navigational: 900,
};

/** Acronyms that should stay upper-case in a title. */
const ACRONYMS = new Set([
  'ai', 'seo', 'geo', 'aeo', 'llm', 'serp', 'ctr', 'cpc', 'roi', 'b2b', 'b2c',
  'saas', 'api', 'url', 'cms', 'crm', 'ux', 'ui', 'kpi', 'gpt', 'faq', 'usa', 'uk',
]);

/** Words that stay lower-case unless they open the title. */
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

function titleCase(s: string): string {
  const parts = s.trim().split(/\s+/);
  return parts
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (i > 0 && i < parts.length - 1 && MINOR.has(lower)) return lower;
      return lower.replace(/^[a-z]/, (c) => c.toUpperCase());
    })
    .join(' ');
}

export function generateBrief(input: BriefInput): ContentBrief {
  const keyword = input.targetKeyword.trim();
  const intent = input.intent ?? classifyIntent(keyword);

  const counts = (input.competitorWordCounts ?? []).filter((n) => n > 0).sort((a, b) => a - b);
  const median = counts.length
    ? counts.length % 2
      ? counts[(counts.length - 1) / 2]
      : Math.round((counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2)
    : INTENT_LENGTH[intent] ?? 1800;

  // Beating the median by ~15% is the usual practical target.
  const targetWords = counts.length ? Math.round(median * 1.15) : median;

  const questions = buildQuestions(keyword, intent, input.unansweredPrompts);

  return {
    topic: titleCase(keyword),
    targetKeyword: keyword,
    intent,
    targetWords,
    benchmark: { median, basis: counts.length ? 'serp' : 'intent-default' },
    outline: buildOutline(keyword, intent, questions, input.brand),
    questions,
    secondaryKeywords: input.relatedKeywords
      .filter((k) => k.phrase.toLowerCase() !== keyword.toLowerCase())
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8)
      .map((k) => k.phrase),
    competingUrls: [...new Set(input.competingUrls)].slice(0, 6),
    requirements: buildRequirements(input, targetWords),
    answerTemplate: `${titleCase(keyword)} is …`,
  };
}

/**
 * The questions the piece must answer. Real unanswered prompts come first —
 * those are measured gaps, not guesses — topped up with the standard shape
 * for the intent.
 */
function buildQuestions(keyword: string, intent: string, unanswered: string[]): string[] {
  const measured = unanswered.slice(0, 6);

  const standard =
    intent === 'transactional' || intent === 'commercial'
      ? [
          `How much does ${keyword} cost?`,
          `What should you look for in ${keyword}?`,
          `Who is ${keyword} best suited for?`,
        ]
      : [
          `What is ${keyword}?`,
          `Why does ${keyword} matter?`,
          `How do you measure ${keyword}?`,
        ];

  const seen = new Set(measured.map((q) => q.toLowerCase()));
  for (const q of standard) {
    if (measured.length >= 8) break;
    if (!seen.has(q.toLowerCase())) { measured.push(q); seen.add(q.toLowerCase()); }
  }

  return measured;
}

/** Question-shaped H2s, which is what answer engines lift as Q&A pairs. */
function buildOutline(
  keyword: string,
  intent: string,
  questions: string[],
  brand: string,
): Array<{ heading: string; guidance: string }> {
  const outline: Array<{ heading: string; guidance: string }> = [
    {
      heading: `What is ${keyword}?`,
      guidance:
        'Open with a 25-45 word definition that stands alone when lifted out of the page. No preamble above it.',
    },
  ];

  for (const q of questions.slice(0, 5)) {
    if (q.toLowerCase().startsWith(`what is ${keyword.toLowerCase()}`)) continue;
    outline.push({
      heading: q,
      guidance:
        'Answer in the first sentence below the heading, then support it. The heading plus that sentence should work as a standalone Q&A pair.',
    });
  }

  if (intent === 'commercial' || intent === 'transactional') {
    outline.push({
      heading: `How to choose ${keyword}`,
      guidance:
        'A comparison table earns citations here. Name real alternatives and be specific about the trade-offs.',
    });
  }

  outline.push({
    heading: 'Common mistakes',
    guidance: 'Concrete failure modes with the fix for each. Highly quotable, and rarely covered well.',
  });

  outline.push({
    heading: `How ${brand} helps`,
    guidance:
      'Name the brand explicitly beside its capabilities. Models attribute to entities they can name, not to "we" or "our platform". Keep it to one short section.',
  });

  return outline;
}

/** The specific, checkable things the GEO and on-page scorers look for. */
function buildRequirements(input: BriefInput, targetWords: number): string[] {
  const requirements = [
    `Target ${targetWords.toLocaleString()} words.`,
    'Open with a self-contained definition — an extractable answer before any preamble.',
    'Include at least three quantified claims (percentages, dollar figures or timeframes).',
    'Cite at least two named primary sources inline, and link them.',
    'Phrase every H2 as a question a buyer would actually type.',
    `Use "${input.targetKeyword}" in the title, the H1, the first paragraph and at least two subheadings.`,
    'Rewrite pronoun-led sentences ("This means…") so each claim stands alone when quoted.',
    'Target a Flesch Reading Ease of 55-70.',
    'Add FAQPage JSON-LD covering the questions above.',
  ];

  if (input.difficulty >= 60) {
    requirements.push(
      `Difficulty is ${input.difficulty}. Ranking will need links; treat the citation win as the near-term goal and the ranking as the longer play.`,
    );
  }

  if (input.competingUrls.length) {
    requirements.push(
      `Read the ${input.competingUrls.length} competing page${input.competingUrls.length === 1 ? '' : 's'} below first. Match their coverage, then beat them on sourcing and specificity.`,
    );
  }

  return requirements;
}

/** Estimated monthly traffic if the piece reaches the top three. */
export function briefUpside(volume: number): number {
  // Roughly the sum of positions 1-3 CTR, weighted toward a realistic #3.
  return round(volume * 0.1, 0);
}
