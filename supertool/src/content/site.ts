import { brand } from '../../brand.config';
import type { CapabilityId } from '@/lib/capabilities';

/**
 * Marketing copy.
 *
 * Feature claims here are not free-form prose: a plan lists capability ids,
 * and the labels are rendered from the capability registry. A capability that
 * is not `verified` or `beta` cannot be listed, because `planFeatureLabel()`
 * throws — so an unshipped feature breaks the build instead of appearing on
 * the pricing page.
 *
 * Testimonials, customer results, review ratings, award badges and partner
 * logos were removed in the Gate 0 truth pass rather than rewritten. All of
 * them were invented. There are no customers to quote yet, and inventing
 * quotes to fill the layout is the specific thing this pass exists to stop.
 */

/** Primary navigation, including the mega-menu columns. */
export const NAV = [
  {
    label: 'Platform',
    href: '/platform',
    columns: [
      {
        heading: 'AI Search',
        links: [
          { label: 'AI Visibility Tracking', href: '/platform/ai-visibility', desc: 'Measure inclusion across connected engines' },
          { label: 'Citation Monitoring', href: '/platform/citations', desc: 'See which URLs an answer pointed at' },
          { label: 'Prompt Sets', href: '/platform/prompt-sets', desc: 'Track the questions buyers actually ask' },
        ],
      },
      {
        heading: 'Content & Technical',
        links: [
          { label: 'Site Audit', href: '/platform/site-audit', desc: '25 technical and answer-readiness checks' },
          { label: 'Keyword Explorer', href: '/platform/keywords', desc: 'Volume, difficulty, opportunity' },
          { label: 'Content Briefs', href: '/platform/content', desc: 'Brief and score — you write it' },
        ],
      },
      {
        heading: 'Publishing',
        links: [
          { label: 'WordPress Publishing', href: '/platform/wordpress', desc: 'Native blocks, Elementor templates' },
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
          { label: 'In-house marketing', href: '/solutions/in-house', desc: 'One platform, no tool sprawl' },
          { label: 'Founders', href: '/solutions/founders', desc: 'Ship content without a team' },
        ],
      },
      {
        heading: 'By goal',
        links: [
          { label: 'Get cited by ChatGPT', href: '/solutions/get-cited', desc: 'Win the answer, not the link' },
          { label: 'Recover lost traffic', href: '/solutions/recover-traffic', desc: 'Fix decay before it compounds' },
        ],
      },
    ],
  },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/blog' },
  { label: 'Company', href: '/about' },
] as const;

/**
 * Facts about the product, checkable in this repository.
 *
 * The previous version of this list carried an "average citation lift" and a
 * "pages scored daily" figure. Neither was measured; there were no customers
 * to measure. Everything below is a count you can verify by reading the code.
 */
export const STATS = [
  { value: 5, suffix: '', label: 'Answer engines measurable', sub: 'ChatGPT, Perplexity, Claude, Gemini, Grok — when you connect them' },
  { value: 25, suffix: '', label: 'Site audit rules', sub: 'Technical, on-page, schema and answer-readiness' },
  { value: 9, suffix: '', label: 'Answer-readiness signals', sub: 'A heuristic checklist, not a prediction' },
  { value: 8, suffix: '', label: 'Opportunity factors', sub: 'Volume, position, intent, competition and four more' },
] as const;

export const SERVICES = [
  {
    icon: 'Sparkles',
    title: 'AI Visibility Tracking',
    href: '/platform/ai-visibility',
    blurb:
      'Run a fixed prompt set across the answer engines you have connected, on a schedule. See mention rate, citation rate, share of voice and where you sit against every competitor named alongside you — with the coverage of each run stated next to it.',
    bullets: ['Scheduled automated runs', 'Per-engine breakdown', 'Coverage shown with every rate'],
  },
  {
    icon: 'Quote',
    title: 'Citation Monitoring',
    href: '/platform/citations',
    blurb:
      'Know which of your URLs answer engines actually quote — and which competitor page took the citation when they did not. Every check keeps the answer excerpt as evidence.',
    bullets: ['URL-level attribution', 'Answer excerpts stored', 'Sentiment on every mention'],
  },
  {
    icon: 'PenTool',
    title: 'Briefs and answer-readiness scoring',
    href: '/platform/content',
    blurb:
      'Briefs built from your keyword and prompt sets, then a nine-signal heuristic that names what to change before you publish: missing statistics, unsourced claims, passages no model can quote. SuperTool does not write the draft.',
    bullets: ['Structured briefs', 'Nine-signal heuristic', 'Concrete fix list per draft'],
  },
  {
    icon: 'ShieldCheck',
    title: 'Site Audit',
    href: '/platform/site-audit',
    blurb:
      'A crawler that grades crawlability, on-page, performance and schema — plus an answer-readiness category most audits skip: question structure, sourcing and author attribution.',
    bullets: ['25 severity-weighted rules', 'Answer-readiness category', 'Fix instructions per issue'],
  },
  {
    icon: 'Search',
    title: 'Keyword Explorer',
    href: '/platform/keywords',
    blurb:
      'Volume and CPC from DataForSEO when you connect it, and a clearly labelled in-product model when you do not. Every figure carries its own source tag, field by field, so a blended number is never presented as a measured one.',
    bullets: ['Per-field provenance', 'Eight-factor opportunity score', 'Estimates labelled as estimates'],
  },
  {
    icon: 'Plug',
    title: 'WordPress Publishing',
    href: '/platform/wordpress',
    blurb:
      'Install the plugin, paste one key, publish. Articles land as native blocks with schema, meta and internal links intact — and Elementor templates ship alongside for teams that use them.',
    bullets: ['Native block output', 'Yoast + Rank Math safe', 'Elementor templates included'],
  },
] as const;

export const PROCESS = [
  {
    step: '01',
    title: 'Connect and baseline',
    body: 'Point SuperTool at your domain and name three competitors. We crawl the site, build a keyword set, generate a funnel-balanced prompt set and run every connected engine once to establish a dated baseline.',
    duration: 'Day 1',
  },
  {
    step: '02',
    title: 'Find the gaps',
    body: 'The dashboard shows which questions you lose, which competitor wins them, and which of your pages is closest to being citable. Opportunities are ranked by an eight-factor score rather than gut feel.',
    duration: 'Day 2-3',
  },
  {
    step: '03',
    title: 'Write, score, publish',
    body: 'Briefs come pre-loaded with the questions and sourcing targets the winning answers contain. Score your draft against the answer-readiness heuristic, then push it live to WordPress.',
    duration: 'Week 1-2',
  },
  {
    step: '04',
    title: 'Re-measure',
    body: 'Re-run the same prompt set on the same schedule after publishing, so the before and after are measured identically. Whether a change moves anything is the question the measurement exists to answer — not something we promise in advance.',
    duration: 'Ongoing',
  },
] as const;

/**
 * Plans.
 *
 * `limits` are quotas — plain numbers, no capability claim attached.
 * `capabilities` are registry ids; their labels render from the registry, and
 * listing an unsellable one is a build error.
 */
export interface Plan {
  name: string;
  price: number;
  annualPrice: number;
  tagline: string;
  limits: readonly string[];
  capabilities: readonly CapabilityId[];
  cta: string;
  highlight: boolean;
}

export const PRICING: readonly Plan[] = [
  {
    name: 'Starter',
    price: 79,
    annualPrice: 65,
    tagline: 'For founders and single-site brands proving the channel.',
    limits: ['1 project', '25 tracked prompts', '250 tracked keywords', 'Weekly automated runs', '100-page site audit'],
    capabilities: ['ai_visibility_tracking', 'citation_monitoring', 'site_audit', 'keyword_research', 'wordpress_publishing', 'csv_export'],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Growth',
    price: 249,
    annualPrice: 199,
    tagline: 'For marketing teams running content as a channel.',
    limits: ['5 projects', '150 tracked prompts', '2,000 tracked keywords', 'Daily automated runs', '1,000-page site audit'],
    capabilities: [
      'ai_visibility_tracking', 'citation_monitoring', 'competitor_share_of_voice', 'site_audit',
      'keyword_research', 'content_briefs', 'geo_scoring', 'wordpress_publishing',
      'elementor_widgets', 'scheduled_runs', 'csv_export',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Scale',
    price: 749,
    annualPrice: 599,
    tagline: 'For portfolios running the same process across many sites.',
    limits: ['Unlimited projects', '1,000 tracked prompts', '20,000 tracked keywords', 'Daily automated runs', 'Unlimited site audit'],
    capabilities: [
      'ai_visibility_tracking', 'citation_monitoring', 'competitor_share_of_voice', 'site_audit',
      'keyword_research', 'content_briefs', 'geo_scoring', 'wordpress_publishing',
      'elementor_widgets', 'scheduled_runs', 'csv_export', 'public_api',
    ],
    cta: 'Talk to sales',
    highlight: false,
  },
] as const;

/**
 * Shown under the pricing table. Says what every plan does *not* include, in
 * the same place as what it does.
 */
export const PRICING_DISCLOSURE = [
  'Answer-engine checks run against the surfaces this deployment has credentials for. A surface without a credential is recorded as unavailable and excluded from your rates — never simulated.',
  'Search position tracking, backlink data, Search Console and GA4 integrations, article generation, multi-seat roles, white-label reporting and per-tenant provider keys are not built. They are not included on any plan at any price.',
  'Google AI Mode has no compliant API and is not measured.',
] as const;

export const FAQS = [
  {
    q: 'What is AI search visibility?',
    a: 'AI search visibility is the share of AI-generated answers in which your brand is named or cited as a source. Unlike a blue-link ranking there is no position one — an assistant either includes you in its answer or it does not. SuperTool measures inclusion across ChatGPT, Perplexity, Claude, Gemini and Grok using a fixed prompt set run on a schedule, against each vendor’s developer API.',
  },
  {
    q: 'Which engines can you actually measure?',
    a: 'Five: ChatGPT, Perplexity, Claude, Gemini and Grok, each through its vendor’s official developer API, and each only when you supply a credential for it. Google AI Mode is not measured — it has no official API, and answering it with a different vendor’s model would make every number derived from it false. A surface you have not connected is recorded as unavailable and left out of your rates rather than guessed at.',
  },
  {
    q: 'Does this replace a rank tracker?',
    a: 'No, and it does not currently include one. SuperTool has no SERP provider integration, so it does not report search positions at all. What it measures is answer-engine inclusion: mention rate, citation rate and share of voice over a fixed prompt set, with the coverage of each run shown alongside.',
  },
  {
    q: 'How accurate are the keyword numbers?',
    a: 'Volume and CPC come from DataForSEO when you connect it. Difficulty is never fully measured, because no provider publishes organic difficulty — where a provider is connected, difficulty blends its paid competition index with an in-product model, and is labelled as part-modelled. Without a provider, every field is a labelled estimate derived from the phrase itself. Traffic and value figures are forecasts from those inputs, shown as approximations.',
  },
  {
    q: 'Do I need my own API keys?',
    a: `${brand.shortName} runs the engine checks using the credentials configured on the deployment. There is no per-tenant credential store today, so bringing your own provider keys is not supported on any plan.`,
  },
  {
    q: 'Will the WordPress plugin break my theme or SEO plugin?',
    a: 'It is designed not to. The plugin adds no front-end CSS and takes over none of your existing metadata. It publishes posts through the standard REST API as native blocks, and writes SEO fields through whichever plugin you already run — Yoast and Rank Math are both handled. That behaviour is covered by tests against a stubbed WordPress API; it has not yet been exercised against a live installation, so treat the integration as beta.',
  },
  {
    q: 'How long before I see results?',
    a: 'We do not know, and we will not quote you a number. There is no outcome data linking a scored rewrite to a later citation, so any figure would be invented. What you get on day one is a dated baseline and a repeatable way to check whether a change moved anything.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'You can export every project — prompts, checks, keywords, audits and articles — as CSV or JSON at any time, including after cancellation.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes — 14 days on any plan, no card required. The trial includes a full prompt-set run across the engines connected on this deployment and a complete site audit, so you can see your actual baseline before deciding.',
  },
] as const;

export const FOOTER_COLUMNS = [
  {
    heading: 'Platform',
    links: [
      { label: 'AI Visibility Tracking', href: '/platform/ai-visibility' },
      { label: 'Citation Monitoring', href: '/platform/citations' },
      { label: 'Prompt Sets', href: '/platform/prompt-sets' },
      { label: 'Site Audit', href: '/platform/site-audit' },
      { label: 'Keyword Explorer', href: '/platform/keywords' },
      { label: 'WordPress Publishing', href: '/platform/wordpress' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
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
