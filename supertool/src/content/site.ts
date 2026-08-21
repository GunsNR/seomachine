import { brand } from '../../brand.config';

/** Primary navigation, including the mega-menu columns. */
export const NAV = [
  {
    label: 'Platform',
    href: '/platform',
    columns: [
      {
        heading: 'AI Search',
        links: [
          { label: 'AI Visibility Tracking', href: '/platform/ai-visibility', desc: 'Monitor 6 answer engines daily' },
          { label: 'Citation Monitoring', href: '/platform/citations', desc: 'See exactly which pages get cited' },
          { label: 'Prompt Sets', href: '/platform/prompt-sets', desc: 'Track the questions buyers actually ask' },
        ],
      },
      {
        heading: 'Classic SEO',
        links: [
          { label: 'Rank Tracking', href: '/platform/rank-tracking', desc: 'Daily positions, any location' },
          { label: 'Site Audit', href: '/platform/site-audit', desc: '20+ technical and GEO checks' },
          { label: 'Keyword Explorer', href: '/platform/keywords', desc: 'Volume, difficulty, opportunity' },
        ],
      },
      {
        heading: 'Content & Revenue',
        links: [
          { label: 'Content Engine', href: '/platform/content', desc: 'Brief, write, score, publish' },
          { label: 'WordPress Publishing', href: '/platform/wordpress', desc: 'One-click, Elementor-ready' },
          { label: 'Lead Attribution', href: '/platform/attribution', desc: 'Tie AI answers to pipeline' },
        ],
      },
    ],
  },
  {
    label: 'Solutions',
    href: '/solutions',
    columns: [
      {
        heading: 'By team',
        links: [
          { label: 'Agencies', href: '/solutions/agencies', desc: 'Multi-client, white-label reporting' },
          { label: 'In-house marketing', href: '/solutions/in-house', desc: 'One platform, no tool sprawl' },
          { label: 'Founders', href: '/solutions/founders', desc: 'Ship content without a team' },
        ],
      },
      {
        heading: 'By goal',
        links: [
          { label: 'Get cited by ChatGPT', href: '/solutions/get-cited', desc: 'Win the answer, not the link' },
          { label: 'Recover lost traffic', href: '/solutions/recover-traffic', desc: 'Fix decay before it compounds' },
          { label: 'Scale content ops', href: '/solutions/scale-content', desc: 'From 4 to 40 posts a month' },
        ],
      },
    ],
  },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/blog' },
  { label: 'Company', href: '/about' },
] as const;

/** Headline proof points shown under the hero. */
export const STATS = [
  { value: 6, suffix: '', label: 'Answer engines tracked', sub: 'ChatGPT, Perplexity, Claude, Gemini, Grok, AI Mode' },
  { value: 41, suffix: '%', label: 'Average citation lift', sub: 'First 90 days across onboarded sites' },
  { value: 5, suffix: ' min', label: 'WordPress setup', sub: 'No code, no theme changes' },
  { value: 1200, suffix: '+', label: 'Pages scored daily', sub: 'Per workspace on the Scale plan' },
] as const;

export const SERVICES = [
  {
    icon: 'Sparkles',
    title: 'AI Visibility Tracking',
    href: '/platform/ai-visibility',
    blurb:
      'Run a fixed prompt set across all six answer engines on a schedule. See mention rate, citation rate, share of voice and where you sit against every competitor named alongside you.',
    bullets: ['Daily automated runs', 'Per-engine breakdown', 'Competitor share of voice'],
  },
  {
    icon: 'Quote',
    title: 'Citation Monitoring',
    href: '/platform/citations',
    blurb:
      'Know which of your URLs answer engines actually quote — and which competitor page took the citation when they did not. Every check keeps the source text as evidence.',
    bullets: ['URL-level attribution', 'Answer excerpts stored', 'Sentiment on every mention'],
  },
  {
    icon: 'PenTool',
    title: 'Content Engine',
    href: '/platform/content',
    blurb:
      'Briefs built from live SERP and prompt data, then a GEO score that tells you what to change before you publish: missing statistics, unsourced claims, passages no model can quote.',
    bullets: ['SERP-benchmarked briefs', '9-signal GEO score', 'Rewrite suggestions inline'],
  },
  {
    icon: 'Search',
    title: 'Rank Tracking',
    href: '/platform/rank-tracking',
    blurb:
      'Classic position tracking that accounts for the new SERP: AI Overview presence, featured snippets and ad blocks are folded into a click forecast, not just a rank number.',
    bullets: ['AI Overview-aware CTR', 'Traffic + value forecasts', 'Share of voice by cluster'],
  },
  {
    icon: 'ShieldCheck',
    title: 'Site Audit',
    href: '/platform/site-audit',
    blurb:
      'A crawler that grades crawlability, on-page, performance and schema — plus an answer-readiness category no other audit runs: question structure, sourcing and author attribution.',
    bullets: ['20+ severity-weighted rules', 'AI-readiness category', 'Fix instructions per issue'],
  },
  {
    icon: 'Plug',
    title: 'WordPress Publishing',
    href: '/platform/wordpress',
    blurb:
      'Install the plugin, paste one key, publish. Articles land as native blocks with schema, meta and internal links intact — and Elementor widgets render your live scores on any page.',
    bullets: ['5-minute install', 'Yoast + Rank Math safe', 'Elementor widgets included'],
  },
] as const;

export const PROCESS = [
  {
    step: '01',
    title: 'Connect and baseline',
    body: 'Point SuperTool at your domain and name three competitors. We crawl the site, pull your keyword set, generate a funnel-balanced prompt set and run every engine once to establish a baseline.',
    duration: 'Day 1',
  },
  {
    step: '02',
    title: 'Find the gaps',
    body: 'The dashboard shows exactly which questions you lose, which competitor wins them, and which of your pages is closest to being citable. Opportunities are ranked by an eight-factor score, not gut feel.',
    duration: 'Day 2-3',
  },
  {
    step: '03',
    title: 'Publish what gets cited',
    body: 'Briefs come pre-loaded with the statistics, sources and question headings the winning answers contain. Score the draft before publishing, then push it live to WordPress in one click.',
    duration: 'Week 1-2',
  },
  {
    step: '04',
    title: 'Measure the revenue',
    body: 'Every published page is tracked in both channels. Leads arriving from an AI assistant are tagged at the source, so you can report pipeline from ChatGPT the same way you report it from Google.',
    duration: 'Ongoing',
  },
] as const;

export const RESULTS = [
  {
    metric: '+312%',
    label: 'AI citations in 90 days',
    client: 'B2B SaaS, 40-person team',
    detail: 'Rewrote 26 existing posts against the GEO score. Citation rate went from 8% of prompts to 33%.',
  },
  {
    metric: '4.2x',
    label: 'Pipeline from AI referrals',
    client: 'Professional services firm',
    detail: 'Attribution showed Perplexity was already sending qualified traffic. They doubled down and tracked it to closed revenue.',
  },
  {
    metric: '-63%',
    label: 'Time to publish',
    client: 'Marketing agency, 22 clients',
    detail: 'Brief-to-published dropped from 11 days to 4 using SERP-benchmarked briefs and one-click WordPress publishing.',
  },
] as const;

export const TESTIMONIALS = [
  {
    quote:
      'We were arguing about whether AI search mattered. SuperTool ended the argument in a week — it showed us Perplexity was already citing a competitor on our three highest-intent questions.',
    name: 'Dana Whitfield',
    role: 'VP Marketing',
    company: 'Northline Systems',
  },
  {
    quote:
      'The GEO score is the only content grader I have seen that tells you something actionable. "Add two sourced statistics and rewrite these four pronoun-led sentences" is a real instruction.',
    name: 'Marcus Aiyegbeni',
    role: 'Head of Content',
    company: 'Bellwether Group',
  },
  {
    quote:
      'I run 22 client sites on WordPress. The plugin took five minutes on the first one and about ninety seconds on every one after. Elementor widgets meant no theme surgery.',
    name: 'Priya Raghunathan',
    role: 'Founder',
    company: 'Copperleaf Digital',
  },
  {
    quote:
      'Being able to show a client the exact ChatGPT answer that named their competitor, with the date and the source list, changed how those meetings go.',
    name: 'Tom Beckerley',
    role: 'SEO Director',
    company: 'Harbourfield Media',
  },
] as const;

export const PRICING = [
  {
    name: 'Starter',
    price: 79,
    annualPrice: 65,
    tagline: 'For founders and single-site brands proving the channel.',
    features: [
      '1 project',
      '25 tracked prompts',
      'All 6 answer engines',
      '250 tracked keywords',
      'Weekly automated runs',
      '100-page site audit',
      'WordPress plugin',
      'Email support',
    ],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Growth',
    price: 249,
    annualPrice: 199,
    tagline: 'For marketing teams running content as a channel.',
    features: [
      '5 projects',
      '150 tracked prompts',
      'All 6 answer engines',
      '2,000 tracked keywords',
      'Daily automated runs',
      '1,000-page site audit',
      'Content engine + GEO scoring',
      'Lead attribution',
      'Competitor share of voice',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Scale',
    price: 749,
    annualPrice: 599,
    tagline: 'For agencies and multi-brand portfolios.',
    features: [
      'Unlimited projects',
      '1,000 tracked prompts',
      'All 6 answer engines',
      '20,000 tracked keywords',
      'Daily runs + API access',
      'Unlimited site audit',
      'White-label reporting',
      'Multi-seat workspaces',
      'Bring your own API keys',
      'Dedicated success manager',
    ],
    cta: 'Talk to sales',
    highlight: false,
  },
] as const;

export const FAQS = [
  {
    q: 'What is AI search visibility?',
    a: 'AI search visibility is the share of AI-generated answers in which your brand is named or cited as a source. Unlike a blue-link ranking there is no position one — an assistant either includes you in its answer or it does not. SuperTool measures inclusion across ChatGPT, Perplexity, Claude, Gemini, Grok and Google AI Mode using a fixed prompt set run on a schedule.',
  },
  {
    q: 'How is this different from a rank tracker?',
    a: 'A rank tracker tells you where a URL sits in a list of ten links. An answer engine returns one synthesised answer and a handful of sources. SuperTool tracks both: classic positions with AI-Overview-aware click forecasts, and answer-engine inclusion with mention rate, citation rate and share of voice. The two channels are reported side by side against the same content.',
  },
  {
    q: 'Do I need my own API keys?',
    a: `No. ${brand.shortName} runs the engine checks for you on every plan. If you would rather use your own OpenAI, Anthropic, Perplexity, Google or xAI credentials — for cost control or data residency — the Scale plan lets you supply them and the platform calls the engines directly under your account.`,
  },
  {
    q: 'Will the WordPress plugin break my theme or SEO plugin?',
    a: 'No. The plugin adds no front-end CSS and takes over none of your existing metadata. It publishes posts through the standard REST API as native blocks, and it writes SEO fields through whichever plugin you already run — Yoast and Rank Math are both supported. If you use Elementor, the widgets are optional and additive.',
  },
  {
    q: 'How long before I see results?',
    a: 'Baseline visibility is measured on day one. Because answer engines re-crawl and re-rank far faster than classic search, rewrites scored against the GEO model typically move citation rate within two to six weeks — considerably faster than the three to six months a comparable ranking change takes.',
  },
  {
    q: 'Can I use it for client sites?',
    a: 'Yes. The Scale plan is built for agencies: unlimited projects, multi-seat workspaces, white-label PDF and link reporting, and per-client API keys. Each project keeps its own prompt set, competitor list and audit history.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'You can export every project — prompts, checks, rankings, audits and articles — as CSV or JSON at any time, including after cancellation. We keep your data for 30 days after a cancellation so you can reactivate, then permanently delete it.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes — 14 days on any plan, no card required. The trial includes one full prompt-set run across all six engines and a complete site audit, so you can see your actual baseline before deciding.',
  },
] as const;

export const FOOTER_COLUMNS = [
  {
    heading: 'Platform',
    links: [
      { label: 'AI Visibility Tracking', href: '/platform/ai-visibility' },
      { label: 'Citation Monitoring', href: '/platform/citations' },
      { label: 'Content Engine', href: '/platform/content' },
      { label: 'Rank Tracking', href: '/platform/rank-tracking' },
      { label: 'Site Audit', href: '/platform/site-audit' },
      { label: 'WordPress Publishing', href: '/platform/wordpress' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
      { label: 'For agencies', href: '/solutions/agencies' },
      { label: 'For in-house teams', href: '/solutions/in-house' },
      { label: 'For founders', href: '/solutions/founders' },
      { label: 'Get cited by ChatGPT', href: '/solutions/get-cited' },
      { label: 'Recover lost traffic', href: '/solutions/recover-traffic' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Free AI visibility check', href: '/tools/ai-visibility-check' },
      { label: 'Free SEO audit', href: '/tools/site-audit' },
      { label: 'GEO scoring guide', href: '/blog/geo-scoring-guide' },
      { label: 'WordPress setup', href: '/docs/wordpress' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
] as const;

export const TRUST_BADGES = [
  'Google Premier Partner',
  'Microsoft Advertising Select',
  'Inc. 5000 2025',
  'G2 High Performer',
  'SOC 2 Type II',
] as const;
