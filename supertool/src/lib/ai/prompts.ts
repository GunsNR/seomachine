/**
 * Prompt-set generation.
 *
 * Answer-engine visibility is only measurable against a *fixed* set of
 * questions. This builds that set from a category and the brand's own terms,
 * spread across the funnel so the score reflects commercial reality rather
 * than a handful of vanity queries.
 */
import { classifyIntent } from '../seo/keywords';

export type PromptCluster =
  | 'discovery'
  | 'comparison'
  | 'alternatives'
  | 'pricing'
  | 'how-to'
  | 'brand';

export interface GeneratedPrompt {
  text: string;
  cluster: PromptCluster;
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
}

const TEMPLATES: Record<PromptCluster, string[]> = {
  discovery: [
    'What is the best {category} in 2026?',
    'Which {category} do experts recommend?',
    'What should I look for when choosing a {category}?',
    'Who are the leading vendors in {category}?',
    'What are the top-rated {category} options for a small team?',
  ],
  comparison: [
    'How does {brand} compare to {competitor}?',
    '{brand} vs {competitor}: which is better?',
    'What is the difference between {brand} and {competitor}?',
    'Is {competitor} better than {brand} for {category}?',
  ],
  alternatives: [
    'What are the best alternatives to {competitor}?',
    'What can I use instead of {competitor}?',
    'Which {category} tools compete with {competitor}?',
  ],
  pricing: [
    'How much does a {category} cost?',
    'What is the most affordable {category}?',
    'Is {brand} worth the price?',
    'Which {category} offers the best value for money?',
  ],
  'how-to': [
    'How do I improve my {topic}?',
    'What is the fastest way to fix {topic}?',
    'How do I measure {topic}?',
    'What tools help with {topic}?',
  ],
  brand: [
    'What is {brand}?',
    'Is {brand} any good?',
    'What do users say about {brand}?',
    'Who is {brand} best suited for?',
  ],
};

export interface PromptSetInput {
  brand: string;
  /** e.g. "AI SEO platform" */
  category: string;
  /** Problem areas the product solves, used for how-to prompts. */
  topics?: string[];
  competitors?: string[];
  /** Cap on the generated set. */
  limit?: number;
}

/**
 * Build a deduplicated, funnel-balanced prompt set.
 * Deterministic: the same input always yields the same set, in the same order.
 */
export function generatePromptSet(input: PromptSetInput): GeneratedPrompt[] {
  const { brand, category, topics = [], competitors = [], limit = 40 } = input;
  const out: GeneratedPrompt[] = [];
  const seen = new Set<string>();

  const add = (raw: string, cluster: PromptCluster) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text || /\{[a-z]+\}/.test(text)) return; // unfilled placeholder
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text, cluster, intent: classifyIntent(text) });
  };

  const fill = (tpl: string, vars: Record<string, string>) =>
    tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

  for (const tpl of TEMPLATES.discovery) add(fill(tpl, { category }), 'discovery');
  for (const tpl of TEMPLATES.brand) add(fill(tpl, { brand }), 'brand');
  for (const tpl of TEMPLATES.pricing) add(fill(tpl, { category, brand }), 'pricing');

  for (const competitor of competitors) {
    for (const tpl of TEMPLATES.comparison) add(fill(tpl, { brand, competitor, category }), 'comparison');
    for (const tpl of TEMPLATES.alternatives) add(fill(tpl, { competitor, category }), 'alternatives');
  }

  for (const topic of topics) {
    for (const tpl of TEMPLATES['how-to']) add(fill(tpl, { topic }), 'how-to');
  }

  return interleaveByCluster(out).slice(0, limit);
}

/**
 * Round-robin across clusters so a truncated set still covers the whole
 * funnel rather than 40 comparison prompts and nothing else.
 */
function interleaveByCluster(prompts: GeneratedPrompt[]): GeneratedPrompt[] {
  const buckets = new Map<PromptCluster, GeneratedPrompt[]>();
  for (const p of prompts) buckets.set(p.cluster, [...(buckets.get(p.cluster) ?? []), p]);

  const order: PromptCluster[] = ['discovery', 'comparison', 'alternatives', 'how-to', 'pricing', 'brand'];
  const queues = order.map((c) => buckets.get(c) ?? []).filter((q) => q.length);

  const out: GeneratedPrompt[] = [];
  let i = 0;
  while (out.length < prompts.length && queues.some((q) => q.length)) {
    const q = queues[i % queues.length];
    if (q.length) out.push(q.shift()!);
    i++;
  }
  return out;
}
