export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  published: string;
  updated?: string;
  author: string;
  readingMinutes: number;
  tags: string[];
  /** Markdown-ish body: ##/### headings, - lists, plain paragraphs. */
  body: string;
}

export const POSTS: BlogPost[] = [
  {
    slug: 'geo-scoring-guide',
    title: 'GEO Scoring: The Nine Signals That Decide Whether AI Cites You',
    description:
      'Generative engine optimization is measurable. Here are the nine page-level signals that separate content answer engines quote from content they ignore, and how to score each one.',
    published: '2026-06-14',
    updated: '2026-08-02',
    author: 'Rank Logic Research',
    readingMinutes: 11,
    tags: ['GEO', 'AI search', 'Content'],
    body: `
Generative engine optimization is the practice of making a page quotable by an answer engine. It is measurable at the page level, and it decomposes into nine signals that can each be scored and fixed independently.

## What is GEO scoring?

GEO scoring grades a page on whether an answer engine could lift a passage from it, attribute that passage to your brand, and trust the claim enough to repeat it. Unlike a ranking score, it is not a prediction of position — it is an assessment of extractability.

According to analysis of pages cited across ChatGPT, Perplexity and Gemini, the pages that get quoted share a consistent shape: they answer the question in the first two sentences, they carry hard numbers, and they name their sources.

## The nine signals

### 1. Direct answer up front (weight: 16)

The single highest-leverage signal. A page that opens with a 25-45 word sentence answering the title question outright gives the model something to lift immediately. A page that opens with three paragraphs of context gives it nothing.

### 2. Verifiable statistics (weight: 14)

Sentences containing numbers get quoted disproportionately often. Percentages, dollar figures and timeframes are all extractable claims; "significantly improved" is not.

### 3. Named, authoritative sources (weight: 13)

In-text attribution — "According to Gartner, ..." — combined with an outbound link is worth far more than an unsourced assertion. Models weight attributed claims higher because they can pass the attribution through.

### 4. Self-contained passages (weight: 13)

A sentence that begins "This means that..." breaks the moment it is lifted out of context. Rewriting pronoun-led sentences so each carries its own subject is one of the cheapest wins available.

### 5. Question-shaped headings (weight: 12)

Each H2 should be a question a buyer would actually type, and the first paragraph below it should answer that question completely. The heading plus its first paragraph should work as a standalone Q&A pair.

### 6. Explicit entity naming (weight: 11)

Models attribute to entities they can name. A page that says "our platform" throughout gives the model nothing to attribute; a page that says "Rank Logic SuperTool" beside each capability gives it an entity.

### 7. Machine-readable structure (weight: 8)

FAQPage or Article JSON-LD, lists rather than dense paragraphs, and a comparison table where one is warranted.

### 8. Topical depth (weight: 7)

Answer engines synthesise from comprehensive sources. Covering the adjacent sub-questions, not just the headline one, materially raises inclusion.

### 9. Plain-language clarity (weight: 6)

Target a Flesch Reading Ease of 55 to 70. Dense prose gets summarised away in the model's own words; clear prose gets quoted verbatim, which is what earns the citation.

## How to apply this

- Score the page before you publish, not after it underperforms.
- Fix the two lowest-weighted-score signals first; they move the total most.
- Re-run your prompt set two weeks after publishing to confirm the lift.

The loop is short enough to actually close, which is what makes this channel different from classic SEO.
`.trim(),
  },
  {
    slug: 'ai-overview-traffic-loss',
    title: 'Your Rankings Held and Your Clicks Fell. Here Is Why.',
    description:
      'When an AI Overview appears above the organic results, click-through at position one can drop by a third. How to diagnose layout-driven loss versus real decline.',
    published: '2026-07-08',
    author: 'Rank Logic Research',
    readingMinutes: 8,
    tags: ['AI Overviews', 'Analytics', 'Rank tracking'],
    body: `
If your positions are stable and your clicks are falling, you have one of three problems — and they have three different fixes.

## The three causes

### 1. An AI Overview appeared above you

This is the most common cause of a sudden click drop with no ranking change. An AI Overview occupies the space above the organic results and answers the query directly, absorbing clicks that previously went to position one.

The effect is largest for informational queries and smallest for navigational ones. Modelling suggests position-one click-through can fall by roughly a third when an Overview is present.

### 2. You lost a citation you used to hold

If an assistant previously cited your page as a source and now cites a competitor, you lose that referral traffic entirely — and it will not show up as a ranking change, because it never was one.

### 3. Genuine content decay

Your page is older than the pages now outranking it on freshness-sensitive queries, and its relevance has drifted. This is the slowest of the three and the easiest to mistake for the other two.

## How to tell them apart

- **Check SERP features first.** If an AI Overview is now present on the query and was not before, that is your answer.
- **Check citation history.** If you held a citation and lost it, the competitor page that replaced you is visible in the source list.
- **Check freshness against the ranking set.** If the pages beating you were updated in the last quarter and yours was not, decay is the likely cause.

## What to do about each

An AI Overview cannot be removed, but being cited inside it recovers a meaningful share of the clicks it absorbs. That makes citation optimization the direct response to cause one — and it happens to be the response to cause two as well.

Content decay is the conventional fix: refresh, expand, re-source and republish. The difference is that you now know which of the three you are actually treating.
`.trim(),
  },
  {
    slug: 'prompt-set-design',
    title: 'How to Build a Prompt Set That Actually Measures Something',
    description:
      'Ad-hoc prompts produce ad-hoc conclusions. A guide to building the fixed, funnel-balanced question set your AI visibility should be measured against.',
    published: '2026-08-05',
    author: 'Rank Logic Research',
    readingMinutes: 7,
    tags: ['AI search', 'Measurement'],
    body: `
Your prompt set is the measuring instrument. If it drifts between runs, every trend line you draw from it is noise.

## Why single prompts prove nothing

Answer engines are non-deterministic. Ask the same question twice and you can get two different vendor lists. This means a single "we showed up!" screenshot carries essentially no information about your actual inclusion rate.

What does carry information is inclusion rate across a fixed set of prompts, measured repeatedly. Twenty-five prompts is enough for a stable signal on a single product line; 100 to 150 is typical for a company with several buyer segments.

## Balance the set across the funnel

A set made entirely of "best X" queries measures awareness and nothing else. A useful set spreads across six clusters:

- **Discovery** — "What is the best product analytics platform?"
- **Comparison** — "How does Acme compare to Mixpanel?"
- **Alternatives** — "What are the best alternatives to Amplitude?"
- **How-to** — "How do I measure feature adoption?"
- **Pricing** — "How much does a product analytics platform cost?"
- **Brand** — "Is Acme any good?"

Bottom-of-funnel clusters should be scored separately. Visibility on "best X" is nice; visibility on "X vs your closest competitor" is revenue.

## Keep it stable, and version it when it changes

Editing a prompt changes what it measures, so treat an edit as starting a new series rather than continuing the old one. Retain the previous series and label it, so a trend line never silently changes meaning underneath you.

## Truncate round-robin, not top-down

If a plan limit forces you to cut the set, take prompts round-robin across clusters rather than from the top. A truncated set that is all comparison prompts tells you about one slice of the funnel and nothing about the rest.
`.trim(),
  },
];

export function findPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
