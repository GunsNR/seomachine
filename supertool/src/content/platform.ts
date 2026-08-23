/**
 * Platform and solutions page content.
 *
 * Each entry renders through the shared FeaturePage template, so adding a
 * page is a data edit, not a new component. Copy is unique per page — the
 * template supplies structure, never filler.
 */
export interface FeaturePageData {
  slug: string;
  eyebrow: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  lead: string;
  /** The problem this capability exists to solve. */
  problem: { heading: string; body: string[] };
  capabilities: Array<{ title: string; body: string }>;
  /** Concrete, checkable outcomes. */
  outcomes: string[];
  faqs: Array<{ q: string; a: string }>;
  related: string[];
}

export const PLATFORM_PAGES: FeaturePageData[] = [
  {
    slug: 'ai-visibility',
    eyebrow: 'AI Search',
    title: 'AI Visibility Tracking',
    metaTitle: 'AI Visibility Tracking Across ChatGPT, Perplexity & Gemini',
    metaDescription:
      'Measure how often ChatGPT, Perplexity, Claude, Gemini and Grok name your brand. Mention rate, citation rate, share of voice and competitor benchmarks, on a schedule you set.',
    keywords: ['AI visibility tracking', 'ChatGPT brand monitoring', 'AI search rank tracker', 'LLM visibility'],
    lead:
      'A fixed prompt set, run on a schedule against the answer engines you have connected, turning "are we showing up in AI?" from an argument into a number you can move.',
    problem: {
      heading: 'You cannot optimise what you cannot see',
      body: [
        'Answer engines do not publish rankings. There is no Search Console for ChatGPT, no impressions report for Perplexity. The only way to know whether an assistant recommends you is to ask it the questions your buyers ask, record what comes back, and do that consistently enough to spot a trend.',
        'Doing that by hand does not scale past a handful of prompts, and one-off spot checks are worthless — model outputs vary run to run, so a single "we showed up!" screenshot tells you nothing about your actual inclusion rate.',
      ],
    },
    capabilities: [
      {
        title: 'Funnel-balanced prompt sets',
        body: 'SuperTool generates prompts across six clusters — discovery, comparison, alternatives, how-to, pricing and brand — so your score reflects commercial reality rather than a handful of vanity queries. Edit, add or import your own at any time.',
      },
      {
        title: 'Every engine, every run',
        body: 'ChatGPT, Perplexity, Claude, Gemini and Grok are asked the same prompts on the same schedule, so per-engine differences are signal rather than timing noise. A surface you have not connected is recorded as unavailable rather than guessed at, and Google AI Mode is not offered at all — it has no compliant API, and answering it with a different vendor\'s model would make every number derived from it false.',
      },
      {
        title: 'Four measures, not one vanity number',
        body: 'Mention rate (were you named), citation rate (was your own URL used as a source), share of voice (what fraction of all vendor mentions were yours) and mention rank (how early you appeared) are tracked separately, because they have different fixes.',
      },
      {
        title: 'Evidence kept for every check',
        body: 'Each run stores the answer excerpt, the full source list and the sentiment of the sentence naming you. When a score moves you can read exactly why, and show a client the actual answer.',
      },
      {
        title: 'Competitor share of voice',
        body: 'Every vendor an assistant names alongside you is recorded. You see which competitor is winning which question, and how that changes week to week.',
      },
      {
        title: 'Every result carries its provenance',
        body: 'Each stored check records whether it came from a live provider call, failed, or was never attempted because the surface is not connected. A run with gaps is reported as a run with gaps — coverage is shown next to every rate, and a failure is never quietly counted as "your brand was absent".',
      },
    ],
    outcomes: [
      'A dated baseline on day one, not a guess',
      'Per-engine breakdown showing where you are weakest',
      'The exact questions you lose, and to whom',
      'Trend lines that survive model-output variance',
    ],
    faqs: [
      {
        q: 'How many prompts do I need to track?',
        a: 'Twenty-five is enough to establish a stable signal for a single product line; 100-150 is typical for a company with several buyer segments. Because answers vary between runs, inclusion rate over a set of prompts is far more reliable than any individual answer.',
      },
      {
        q: 'How often are the engines checked?',
        a: 'Weekly on Starter and daily on Growth and Scale. You can also trigger an immediate run at any time — useful right after publishing or updating a page.',
      },
      {
        q: 'Does this use my own ChatGPT account?',
        a: 'No. Checks run through the vendors\' developer APIs, so nothing touches your personal accounts or chat history. That also means a developer API is what is being measured — it is a close proxy for the consumer assistant, not the identical surface, and it carries no personalisation or chat history.',
      },
    ],
    related: ['citations', 'prompt-sets', 'content'],
  },
  {
    slug: 'citations',
    eyebrow: 'AI Search',
    title: 'Citation Monitoring',
    metaTitle: 'AI Citation Monitoring — See Which Pages Answer Engines Quote',
    metaDescription:
      'Track which of your URLs answer engines cite as sources, which competitor page took the citation when they did not, and how each citation trends over time.',
    keywords: ['AI citation tracking', 'ChatGPT citations', 'Perplexity sources', 'answer engine attribution'],
    lead:
      'Mentions are nice. Citations send traffic. Citation monitoring tells you which specific URLs answer engines are willing to quote — and which page beat yours when they were not.',
    problem: {
      heading: 'A mention without a citation is a dead end',
      body: [
        'When an assistant names your brand but cites a review site as its source, the click goes to the review site. You get the mention and someone else gets the visit. Tracking mentions alone hides that gap entirely.',
        'Citation is also the part you can most directly influence: it is a property of a specific page, so it responds to specific content changes in weeks rather than months.',
      ],
    },
    capabilities: [
      {
        title: 'URL-level attribution',
        body: 'Every source an engine returns is parsed, resolved and matched against your domain. You see citation counts per URL, not just per brand.',
      },
      {
        title: 'Competitive citation capture',
        body: 'When a competitor page takes the citation, SuperTool records which page won. That page is the brief for your replacement.',
      },
      {
        title: 'Mention-without-citation gap',
        body: 'A dedicated view lists prompts where you were named but not cited — the highest-leverage fixes available, because the engine already knows who you are.',
      },
      {
        title: 'Answer text preserved',
        body: 'The sentence naming you, the surrounding paragraph and the full source list are stored per check, so nothing rests on a screenshot someone took once.',
      },
      {
        title: 'Sentiment on every mention',
        body: 'Being named as the expensive option is not the same as being named as the leading one. Sentiment is scored on the sentences that actually mention you.',
      },
      {
        title: 'Alerting on change',
        body: 'Get notified when you lose a citation you previously held, or when a competitor appears on a question you owned.',
      },
    ],
    outcomes: [
      'A ranked list of pages worth rewriting first',
      'The competitor URL that took each citation',
      'Prompts where you are mentioned but never cited',
      'A dated record you can put in a client report',
    ],
    faqs: [
      {
        q: 'What counts as a citation?',
        a: 'Your own domain appearing in the source list the engine returns, or linked inline in the answer. A brand mention in the prose without a matching source URL is recorded separately as a mention, because the two behave very differently for traffic.',
      },
      {
        q: 'Can I see which page a competitor got cited for?',
        a: 'Yes. Every source URL in every answer is stored, so competitor citations are visible at page level. This is usually the fastest route to a brief that actually wins the question back.',
      },
    ],
    related: ['ai-visibility', 'content', 'wordpress'],
  },
  {
    slug: 'prompt-sets',
    eyebrow: 'AI Search',
    title: 'Prompt Sets',
    metaTitle: 'AI Prompt Set Management for Answer Engine Tracking',
    metaDescription:
      'Build and manage the fixed question set your AI visibility is measured against. Funnel-balanced generation, clustering, and full manual control.',
    keywords: ['AI prompt tracking', 'prompt set management', 'AEO tracking queries'],
    lead:
      'Your prompt set is the measuring instrument. If it drifts, your trend line is meaningless — so SuperTool treats it as versioned, deliberate infrastructure.',
    problem: {
      heading: 'Ad-hoc prompts produce ad-hoc conclusions',
      body: [
        'Teams typically start by typing a few questions into ChatGPT and screenshotting the result. Two weeks later they type slightly different questions and compare. Any change they see is as likely to come from the wording as from anything they did.',
        'A stable, representative, funnel-balanced set is the difference between measurement and anecdote.',
      ],
    },
    capabilities: [
      {
        title: 'Automatic generation',
        body: 'Give SuperTool your category, competitors and problem areas. It produces a deduplicated set spread across discovery, comparison, alternatives, how-to, pricing and brand questions.',
      },
      {
        title: 'Clustered by funnel stage',
        body: 'Every prompt is tagged with a cluster and an inferred search intent, so you can score bottom-of-funnel visibility separately from top-of-funnel awareness.',
      },
      {
        title: 'Full manual control',
        body: 'Add, edit, disable and bulk-import prompts. Nothing is generated that you cannot override, and disabling a prompt preserves its history rather than deleting it.',
      },
      {
        title: 'Balanced truncation',
        body: 'When a plan limit truncates a set, prompts are taken round-robin across clusters, so a smaller set still covers the whole funnel instead of forty comparison queries.',
      },
    ],
    outcomes: [
      'A prompt set that mirrors your real buyer journey',
      'Bottom-of-funnel visibility scored separately',
      'Stable week-over-week comparisons',
      'Full history retained when prompts change',
    ],
    faqs: [
      {
        q: 'Can I import prompts from a spreadsheet?',
        a: 'Yes. Paste or upload a CSV of questions and SuperTool will cluster and classify each one on import. You can override any classification afterwards.',
      },
      {
        q: 'What happens to history if I edit a prompt?',
        a: 'Editing a prompt starts a new measurement series for it, and the previous series is retained and clearly labelled, so a trend line never silently changes meaning underneath you.',
      },
    ],
    related: ['ai-visibility', 'citations', 'keywords'],
  },
  {
    slug: 'site-audit',
    eyebrow: 'Classic SEO',
    title: 'Site Audit',
    metaTitle: 'Technical SEO Audit With AI-Readiness Scoring',
    metaDescription:
      'Crawl your site for crawlability, on-page, performance and schema issues — plus an answer-readiness category that no other audit runs.',
    keywords: ['technical SEO audit', 'site crawler', 'SEO health score', 'AI readiness audit'],
    lead:
      'Twenty-plus severity-weighted checks across five categories, including one that grades whether an answer engine could quote the page at all.',
    problem: {
      heading: 'Passing a technical audit is not the same as being citable',
      body: [
        'Every audit tool checks title length, canonical tags and image alt text. None of them ask whether the page opens with an extractable answer, whether its claims are sourced, or whether a single sentence on it could be lifted into an AI answer without losing meaning.',
        'Those are now ranking-adjacent factors, and they are invisible to a conventional crawl.',
      ],
    },
    capabilities: [
      {
        title: 'Five graded categories',
        body: 'Crawlability, on-page, performance, schema and AI-readiness are scored separately, so a site with clean technicals and unciteable content cannot hide behind a single green number.',
      },
      {
        title: 'Severity-weighted health score',
        body: 'Findings are weighted critical, warning or notice, then normalised against the number of checks actually run — so a five-page site and a five-hundred-page site are graded on the same curve.',
      },
      {
        title: 'Site-wide duplicate and orphan detection',
        body: 'Duplicate titles and descriptions are grouped across the whole crawl, and pages reachable but unlinked from any other crawled page are flagged as orphans.',
      },
      {
        title: 'Answer-readiness rules',
        body: 'Dedicated checks for question-shaped headings, FAQPage schema, outbound citations and author attribution in structured data — the signals that separate cited pages from ignored ones.',
      },
      {
        title: 'A fix, not just a flag',
        body: 'Every finding carries a specific instruction. Not "missing meta description" but the length to target and what it needs to contain.',
      },
    ],
    outcomes: [
      'One health score you can track weekly',
      'Critical issues separated from cosmetic ones',
      'AI-readiness graded alongside technicals',
      'An exportable, prioritised fix list',
    ],
    faqs: [
      {
        q: 'How many pages can it crawl?',
        a: 'Up to 100 on Starter, 1,000 on Growth and unlimited on Scale. Crawls run breadth-first from your start URL and stay on-origin, with polite concurrency limits.',
      },
      {
        q: 'Will it slow my site down?',
        a: 'No. Crawls use limited concurrency and identify themselves with a named user agent, so you can rate-limit or exclude the crawler in robots.txt if you prefer.',
      },
    ],
    related: ['keywords', 'content', 'wordpress'],
  },
  {
    slug: 'keywords',
    eyebrow: 'Classic SEO',
    title: 'Keyword Explorer',
    metaTitle: 'Keyword Research With Difficulty & Opportunity Scoring',
    metaDescription:
      'Search volume, difficulty, CPC, intent and an eight-factor opportunity score for every keyword — plus the content gap against pages currently ranking.',
    keywords: ['keyword research tool', 'keyword difficulty', 'search intent analysis', 'content gap analysis'],
    lead:
      'Volume and difficulty are table stakes. The useful question is which keyword is worth your next two weeks — and that is a different calculation.',
    problem: {
      heading: 'A keyword list is not a plan',
      body: [
        'Exporting ten thousand keywords sorted by volume produces a list nobody can act on. The terms at the top are unwinnable, the terms at the bottom are worthless, and the ones that matter are somewhere in the middle for reasons volume alone will never reveal.',
        'What you need is a ranked shortlist with the reasoning attached.',
      ],
    },
    capabilities: [
      {
        title: 'Eight-factor opportunity score',
        body: 'Volume, current position, intent, competition, cluster size, CTR headroom, content freshness and trend direction, each weighted and each visible — so you can disagree with the ranking on specific grounds.',
      },
      {
        title: 'Intent classification',
        body: 'Every query is classified informational, commercial, transactional or navigational, so you can weight bottom-of-funnel terms without hand-tagging thousands of rows.',
      },
      {
        title: 'Content gap analysis',
        body: 'Terms that most of the currently-ranking pages use and your draft does not, ranked by how many competitors use them. This is the fastest route from a thin draft to a competitive one.',
      },
      {
        title: 'Length benchmarking',
        body: 'The median word count of the pages currently ranking, and the target that beats it — so "make it longer" becomes a specific number.',
      },
      {
        title: 'Cluster grouping',
        body: 'Keywords are grouped into topic clusters so you can plan a pillar and its supporting pages as one unit rather than as isolated posts.',
      },
    ],
    outcomes: [
      'A shortlist you can actually start on Monday',
      'Quick wins flagged automatically',
      'Word-count targets grounded in the live SERP',
      'The specific terms your draft is missing',
    ],
    faqs: [
      {
        q: 'Where does the volume data come from?',
        a: 'Volume and CPC come from DataForSEO when you connect it. Difficulty is always partly modelled, because no provider publishes organic difficulty directly — paid competition is a different thing and is not presented as if it were the same. Anything not measured is labelled as an estimate, field by field. Search Console is not connected today.',
      },
      {
        q: 'Can I export the data?',
        a: 'Yes, as CSV or JSON, at any time, on any plan — including after cancellation.',
      },
    ],
    related: ['site-audit', 'content', 'prompt-sets'],
  },
  {
    slug: 'content',
    eyebrow: 'Content & Revenue',
    title: 'Content Engine',
    metaTitle: 'AI Content Engine With GEO Scoring Before You Publish',
    metaDescription:
      'Briefs built from live SERP and prompt data, drafts scored on nine citation signals, and specific rewrite instructions before anything goes live.',
    keywords: ['AI content optimization', 'GEO scoring', 'content brief generator', 'content optimization tool'],
    lead:
      'Write for the answer, not just the index. A nine-signal score that tells you which sentences a model can quote, which claims need a source, and which heading should have been a question.',
    problem: {
      heading: 'Content graders tell you what, never what to change',
      body: [
        'A score of 68 out of 100 is not an instruction. Neither is "add more keywords". The gap between a draft that gets cited and one that does not is usually four or five specific, findable defects — and nothing on the market points at them.',
        'Answer engines lift self-contained, sourced, quantified sentences. Most marketing copy is none of those things.',
      ],
    },
    capabilities: [
      {
        title: 'SERP-benchmarked briefs',
        body: 'Each brief carries the median length of the ranking set, the questions the winning answers address, the statistics they cite and the terms your draft would be missing.',
      },
      {
        title: 'Nine-signal GEO score',
        body: 'Direct answer, verifiable statistics, named sources, self-contained passages, question-shaped headings, entity clarity, machine-readable structure, topical depth and plain-language clarity — each weighted, each with a specific fix.',
      },
      {
        title: 'Quotable-passage extraction',
        body: 'SuperTool shows you the sentences a model would most plausibly lift, and flags pronoun-led sentences that break when quoted out of context.',
      },
      {
        title: 'Classic on-page scoring alongside',
        body: 'Seventeen conventional checks — title, meta, headings, density, distribution, links, images, slug — run in parallel, so optimising for answers never costs you the ranking.',
      },
      {
        title: 'Readability that means something',
        body: 'Flesch, Flesch-Kincaid, Gunning Fog, SMOG and ARI, reported together with a consensus grade. Dense prose gets summarised away; clear prose gets quoted verbatim.',
      },
    ],
    outcomes: [
      'A specific rewrite list, not a vague score',
      'Word-count and sourcing targets from the live SERP',
      'Both channels optimised in one pass',
      'Drafts scored before they cost you a publish',
    ],
    faqs: [
      {
        q: 'Does it write the article for me?',
        a: 'No. SuperTool does not write article copy at all. It produces the brief, the outline, the questions to answer and the sourcing targets, and it scores and critiques whatever draft you put in — whether a human or a model wrote it.',
      },
      {
        q: 'What is a good GEO score?',
        a: 'There is no validated threshold. The score is a heuristic over nine structural signals with hand-chosen weights, and it has never been tested against whether a page later earned a citation. Treat the signal breakdown as a checklist of concrete fixes, not the number as a forecast.',
      },
    ],
    related: ['citations', 'wordpress', 'keywords'],
  },
  {
    slug: 'wordpress',
    eyebrow: 'Content & Revenue',
    title: 'WordPress Publishing',
    metaTitle: 'WordPress SEO Plugin — Publish in One Click, Elementor Ready',
    metaDescription:
      'Install in five minutes, paste one key, publish. Native blocks, schema and meta intact, Yoast and Rank Math supported, with optional Elementor widgets.',
    keywords: ['WordPress SEO plugin', 'Elementor SEO widget', 'WordPress publishing API', 'Yoast integration'],
    lead:
      'The plugin is deliberately boring: no front-end CSS, no theme takeover, no fight with the SEO plugin you already run.',
    problem: {
      heading: 'Most publishing integrations cost more time than they save',
      body: [
        'A plugin that rewrites your metadata, injects its own stylesheet and disagrees with Yoast is not an integration — it is a migration you did not agree to. Teams end up copying and pasting instead, which is slow and drops schema, internal links and meta on the floor every time.',
        'The fix is a plugin that writes through your existing stack rather than around it.',
      ],
    },
    capabilities: [
      {
        title: 'Five-minute install',
        body: 'Upload the plugin, paste a project key, done. No code changes, no theme edits, no FTP, and nothing to configure before it works.',
      },
      {
        title: 'Native block output',
        body: 'Articles publish as real WordPress blocks — headings, lists, tables, images — not as a wall of raw HTML in a single Classic block.',
      },
      {
        title: 'Writes through Yoast or Rank Math',
        body: 'Meta title, description and canonical are written into whichever SEO plugin you already run, so your existing configuration stays authoritative.',
      },
      {
        title: 'Schema injection',
        body: 'Article, FAQPage and author structured data are attached on publish, matching the content that actually shipped.',
      },
      {
        title: 'Elementor widgets included',
        body: 'Three optional widgets — AI Visibility Score, Engine Breakdown and Citation Feed — render live data on any Elementor page, styled by your theme, with no shortcodes.',
      },
      {
        title: 'Attribution tracking',
        body: 'A lightweight, cookieless snippet tags visitors arriving from answer-engine referrers, so AI-sourced leads are identifiable in your CRM.',
      },
    ],
    outcomes: [
      'Brief to published in minutes, not days',
      'Schema and meta preserved every time',
      'No conflict with your existing SEO plugin',
      'Live scores renderable anywhere in Elementor',
    ],
    faqs: [
      {
        q: 'Which WordPress versions are supported?',
        a: 'WordPress 6.0 and above on PHP 7.4 and above. The plugin uses only core REST APIs and standard hooks, so it works with block themes and classic themes alike.',
      },
      {
        q: 'Do the Elementor widgets require Elementor Pro?',
        a: 'No. The widgets register against free Elementor and inherit your theme typography and colours, so they match the site rather than importing a second design system.',
      },
      {
        q: 'What if I do not use WordPress?',
        a: 'Everything except one-click publishing works regardless of platform — tracking, auditing, scoring and attribution only need a URL. A REST API is available on Scale for publishing into any other CMS.',
      },
    ],
    related: ['content', 'citations', 'site-audit'],
  },
];

export const SOLUTION_PAGES: FeaturePageData[] = [
  {
    slug: 'in-house',
    eyebrow: 'For in-house teams',
    title: 'SuperTool for In-House Teams',
    metaTitle: 'AI Search Visibility for In-House Marketing Teams',
    metaDescription:
      'Replace the rank tracker, the AI monitor, the content grader and the publishing workflow with one platform that reports both channels together.',
    keywords: ['in-house SEO tools', 'marketing team SEO platform', 'consolidate SEO tools'],
    lead:
      'One platform, one number, one report your executive team can actually read.',
    problem: {
      heading: 'Four tools that disagree is worse than one that is imperfect',
      body: [
        'A rank tracker, an AI monitor, a content grader and a CMS plugin produce four dashboards with four definitions and no shared page-level view. Every monthly report becomes a reconciliation exercise before it becomes an analysis.',
        'Meanwhile the question leadership actually asks — is content working — goes unanswered because no single tool can see the whole path.',
      ],
    },
    capabilities: [
      { title: 'Both channels, one page view', body: 'Every published URL carries its rankings, its citations, its GEO score and its attributed leads on one screen.' },
      { title: 'Executive-ready reporting', body: 'A blended visibility score with the per-engine detail one click away, so the board deck does not need a translator.' },
      { title: 'Consolidated spend', body: 'One subscription replaces the stack, usually below the combined cost of the tools it retires.' },
      { title: 'Workflow, not just measurement', body: 'Brief, score, publish and attribute in the same place the measurement happens.' },
    ],
    outcomes: [
      'One monthly report instead of four exports',
      'Content performance visible at page level',
      'Lower total tool spend',
      'A defensible answer on AI search',
    ],
    faqs: [
      { q: 'Can we migrate our existing keyword lists?', a: 'Yes. Import keywords and historical positions by CSV; SuperTool will classify intent and build clusters on import.' },
      { q: 'Does it integrate with Search Console and GA4?', a: 'Not today. Neither integration is built. SuperTool reports only what it measures itself, and does not blend in your analytics.' },
    ],
    related: ['get-cited', 'recover-traffic', 'founders'],
  },
  {
    slug: 'founders',
    eyebrow: 'For founders',
    title: 'SuperTool for Founders',
    metaTitle: 'AI SEO Platform for Founders and Small Teams',
    metaDescription:
      'Ship content that gets cited without hiring an SEO team. Briefs, scoring and one-click publishing, with the strategy built into the tool.',
    keywords: ['SEO for startups', 'founder SEO tool', 'small team content marketing'],
    lead:
      'The strategy is in the product, so you do not have to hire it.',
    problem: {
      heading: 'You do not have time to become an SEO',
      body: [
        'Founders writing their own content face a genuine expertise gap: they know the subject better than any agency would, and know nothing about which of their sentences an answer engine can use.',
        'Generic advice does not close that gap. Specific, per-draft instructions do.',
      ],
    },
    capabilities: [
      { title: 'Briefs that decide for you', body: 'The topic, the angle, the questions to answer and the length target, derived from what is currently winning rather than from a template.' },
      { title: 'Scoring before you publish', body: 'A specific list of what to change, so a first draft becomes competitive without an editor.' },
      { title: 'Publish without a workflow', body: 'One click to WordPress with schema and meta already handled.' },
      { title: 'Proof it is working', body: 'Citation and ranking movement tracked from day one, so you know whether to keep going.' },
    ],
    outcomes: [
      'Publish without hiring an agency',
      'Specific edits instead of vague advice',
      'Evidence the channel is working',
      'Under an hour of overhead per post',
    ],
    faqs: [
      { q: 'Is the Starter plan enough for one site?', a: 'Yes. Twenty-five prompts across the engines you connect, 250 keywords and a 100-page audit covers a single-product site comfortably.' },
      { q: 'How much time does this take per week?', a: 'Most single-site users spend under an hour a week: review the opportunity list, take the top brief, write, score, publish.' },
    ],
    related: ['in-house', 'get-cited', 'recover-traffic'],
  },
  {
    slug: 'get-cited',
    eyebrow: 'By goal',
    title: 'Get Cited by ChatGPT',
    metaTitle: 'How to Get Cited by ChatGPT, Perplexity and Gemini',
    metaDescription:
      'A measured, repeatable process for becoming a source answer engines quote: baseline, find the gap, rewrite against the signals, verify the lift.',
    keywords: ['get cited by ChatGPT', 'AI citation optimization', 'become an AI source', 'GEO strategy'],
    lead:
      'Citation is not luck. It is a set of page properties you can measure, change and re-measure.',
    problem: {
      heading: 'Being good is not the same as being quotable',
      body: [
        'Plenty of genuinely authoritative pages never get cited, because nothing on them can be lifted cleanly: the claims are unsourced, the numbers are absent, and every other sentence begins with "this means".',
        'Answer engines are not judging your expertise directly. They are judging whether a passage can be extracted, attributed and trusted.',
      ],
    },
    capabilities: [
      { title: 'Baseline first', body: 'Measure current mention and citation rate across every engine before changing anything, so any lift is attributable.' },
      { title: 'Find the winning pages', body: 'For every prompt you lose, see the exact competitor URL that took the citation.' },
      { title: 'Rewrite against nine signals', body: 'Direct answers, hard numbers, named sources, self-contained passages, question headings, entity clarity, structure, depth and clarity.' },
      { title: 'Re-measure after you publish', body: 'Re-run the same prompt set on demand once a change is live, so the before and after are measured the same way. How long a change takes to show up, if it does, is not something we can promise — that is what the measurement is for.' },
    ],
    outcomes: [
      'A measured baseline, not a hunch',
      'The specific pages beating you, per question',
      'A repeatable rewrite checklist',
      'Verified lift within weeks',
    ],
    faqs: [
      { q: 'How long does it take to get cited?', a: 'We do not know, and neither does anyone selling you a number. SuperTool has no outcome data linking a scored rewrite to a later citation, so it does not forecast one. What it gives you is a dated baseline and a repeatable way to check whether a change moved anything.' },
      { q: 'Do I need new backlinks?', a: 'Usually not, for citation specifically. Link authority matters far more for classic ranking than for whether a passage is quotable. That is precisely why this channel is winnable for smaller sites.' },
    ],
    related: ['recover-traffic', 'in-house', 'founders'],
  },
  {
    slug: 'recover-traffic',
    eyebrow: 'By goal',
    title: 'Recover Lost Traffic',
    metaTitle: 'Recover Organic Traffic Lost to AI Overviews',
    metaDescription:
      'Diagnose whether flat rankings and falling clicks are content decay, an AI Overview rollout, or lost citations — then fix the right one.',
    keywords: ['recover organic traffic', 'AI Overview traffic loss', 'content decay', 'traffic drop diagnosis'],
    lead:
      'Flat positions and falling clicks have three different causes and three different fixes. Diagnosing which one you have is most of the work.',
    problem: {
      heading: 'The drop that does not show up in your rank tracker',
      body: [
        'When clicks fall while positions hold, the usual suspects are an AI Overview appearing above you, a competitor taking the citations you used to earn, or slow content decay as your page ages against fresher ones.',
        'Treating the wrong one wastes a quarter. A rank tracker on its own cannot tell them apart.',
      ],
    },
    capabilities: [
      { title: 'AI Overview impact modelling', body: 'Click forecasts adjusted for AI Overview presence, so you can see how much of the drop is SERP layout rather than performance.' },
      { title: 'Citation loss detection', body: 'Alerts when you lose a citation you previously held, with the competitor URL that replaced you.' },
      { title: 'Decay scoring', body: 'Freshness is a weighted factor in opportunity scoring, surfacing pages whose age is now costing them.' },
      { title: 'Prioritised recovery list', body: 'Pages ranked by recoverable traffic, so the biggest wins come first.' },
    ],
    outcomes: [
      'A real diagnosis instead of a guess',
      'Layout-driven loss separated from real decline',
      'A ranked recovery queue',
      'Alerts before the next drop compounds',
    ],
    faqs: [
      { q: 'Can I recover traffic lost to an AI Overview?', a: 'Partly. You cannot remove the Overview, but being cited inside it recovers a meaningful share of the clicks it absorbs — which is exactly what citation optimisation targets.' },
      { q: 'How far back does history go?', a: 'From your first run. There is no historical backfill: answer-engine responses are not archived anywhere retrievable, and no Search Console import exists.' },
    ],
    related: ['get-cited', 'in-house', 'founders'],
  },
];

export const ALL_FEATURE_PAGES = [...PLATFORM_PAGES, ...SOLUTION_PAGES];

export function findFeaturePage(slug: string): FeaturePageData | undefined {
  return ALL_FEATURE_PAGES.find((p) => p.slug === slug);
}

/** The canonical URL for a feature page, whichever section it lives in. */
export function featureHref(slug: string): string {
  const section = SOLUTION_PAGES.some((p) => p.slug === slug) ? 'solutions' : 'platform';
  return `/${section}/${slug}`;
}
