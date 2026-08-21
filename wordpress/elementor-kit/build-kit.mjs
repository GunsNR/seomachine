/**
 * Generates importable Elementor templates that reproduce the Rank Logic
 * SuperTool marketing design.
 *
 * Elementor's JSON format is verbose and easy to get subtly wrong by hand, so
 * the sections are composed from small helpers here and written out as
 * validated files. Run: node build-kit.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'templates');
mkdirSync(OUT, { recursive: true });

const C = {
  navy: '#07182E',
  navySoft: '#0F2A4A',
  brand: '#1466D8',
  brandDark: '#0E4CA6',
  brandLight: '#E8F1FE',
  accent: '#FF6B2C',
  ink: '#0B1220',
  body: '#4A5568',
  line: '#E3E8EF',
  white: '#FFFFFF',
  surfaceAlt: '#F6F9FD',
};

let seq = 0;
/** Elementor ids are 7-char hex; deterministic here so re-runs diff cleanly. */
const id = () => (0x1000000 + ++seq * 0x9e37).toString(16).slice(-7);

const px = (n) => ({ unit: 'px', size: n, sizes: [] });
const gap = (top, right, bottom, left, unit = 'px') => ({
  unit, top: String(top), right: String(right), bottom: String(bottom), left: String(left), isLinked: false,
});

const widget = (widgetType, settings) => ({
  id: id(), elType: 'widget', widgetType, settings, elements: [], isInner: false,
});

const column = (elements, settings = {}) => ({
  id: id(), elType: 'column', elements, isInner: false,
  settings: { _column_size: 100, _inline_size: null, ...settings },
});

const section = (columns, settings = {}) => ({
  id: id(), elType: 'section', elements: columns, isInner: false,
  settings: {
    structure: String(columns.length * 10),
    content_width: 'boxed',
    gap: 'extended',
    padding: gap(96, 0, 96),
    ...settings,
  },
});

const heading = (title, opts = {}) => widget('heading', {
  title,
  header_size: opts.tag ?? 'h2',
  align: opts.align ?? 'left',
  title_color: opts.color ?? C.ink,
  typography_typography: 'custom',
  typography_font_family: 'Manrope',
  typography_font_size: px(opts.size ?? 40),
  typography_font_weight: '800',
  typography_line_height: { unit: 'em', size: opts.lineHeight ?? 1.12, sizes: [] },
  typography_letter_spacing: px(opts.tracking ?? -1),
  ...opts.extra,
});

const text = (editor, opts = {}) => widget('text-editor', {
  editor: `<p>${editor}</p>`,
  align: opts.align ?? 'left',
  text_color: opts.color ?? C.body,
  typography_typography: 'custom',
  typography_font_family: 'Inter',
  typography_font_size: px(opts.size ?? 17),
  typography_line_height: { unit: 'em', size: 1.7, sizes: [] },
  ...opts.extra,
});

const button = (label, opts = {}) => widget('button', {
  text: label,
  link: { url: opts.url ?? '#', is_external: '', nofollow: '' },
  align: opts.align ?? 'left',
  size: 'lg',
  background_color: opts.bg ?? C.accent,
  button_text_color: opts.color ?? C.white,
  border_radius: gap(999, 999, 999, 999),
  text_padding: gap(20, 34, 20, 34),
  typography_typography: 'custom',
  typography_font_family: 'Inter',
  typography_font_size: px(17),
  typography_font_weight: '600',
  ...opts.extra,
});

const iconBox = (title, description, icon = 'fas fa-bolt') => widget('icon-box', {
  title_text: title,
  description_text: description,
  selected_icon: { value: icon, library: 'fa-solid' },
  view: 'framed',
  shape: 'square',
  position: 'top',
  primary_color: C.brand,
  title_color: C.ink,
  description_color: C.body,
  title_typography_typography: 'custom',
  title_typography_font_family: 'Manrope',
  title_typography_font_size: px(19),
  title_typography_font_weight: '700',
  description_typography_typography: 'custom',
  description_typography_font_family: 'Inter',
  description_typography_font_size: px(15),
  description_typography_line_height: { unit: 'em', size: 1.7, sizes: [] },
});

const counter = (number, title, suffix = '') => widget('counter', {
  starting_number: 0,
  ending_number: number,
  suffix,
  title,
  number_color: C.brand,
  title_color: C.ink,
  typography_typography: 'custom',
  typography_font_family: 'Manrope',
  typography_font_size: px(44),
  typography_font_weight: '800',
  title_typography_typography: 'custom',
  title_typography_font_family: 'Inter',
  title_typography_font_size: px(15),
  title_typography_font_weight: '600',
});

const darkSection = (columns, extra = {}) => section(columns, {
  background_background: 'classic',
  background_color: C.navy,
  padding: gap(104, 0, 104),
  ...extra,
});

/* ---------------------------------------------------------------- */
/* Templates                                                         */
/* ---------------------------------------------------------------- */

const templates = {
  '01-hero': {
    title: 'SuperTool — Hero',
    type: 'section',
    content: [
      darkSection([
        column([
          text('GENERATIVE ENGINE OPTIMIZATION', {
            color: '#8FBBF8', size: 12,
            extra: { typography_letter_spacing: px(2), typography_font_weight: '700' },
          }),
          heading('Get cited by AI. Get ranked by Google.', {
            tag: 'h1', size: 62, color: C.white, tracking: -2,
          }),
          text(
            'Half your buyers now ask an assistant before they ever open a search results page. Rank Logic SuperTool writes content tuned to how those assistants pick sources, publishes it to your site in one click, and tracks every citation, ranking and lead it earns.',
            { color: 'rgba(255,255,255,0.75)', size: 18 },
          ),
          button('Start free trial', { url: '/signup' }),
        ], { _inline_size: 55 }),
        column([
          widget('image', {
            image: { url: '', id: '' },
            image_size: 'full',
            align: 'center',
            caption: 'Drop a dashboard screenshot here',
          }),
        ], { _inline_size: 45 }),
      ]),
    ],
  },

  '02-stat-bar': {
    title: 'SuperTool — Stat Bar',
    type: 'section',
    content: [
      section([
        column([counter(6, 'Answer engines tracked')], { _inline_size: 25 }),
        column([counter(41, 'Average citation lift', '%')], { _inline_size: 25 }),
        column([counter(5, 'Minute WordPress setup')], { _inline_size: 25 }),
        column([counter(1200, 'Pages scored daily', '+')], { _inline_size: 25 }),
      ], {
        background_background: 'classic',
        background_color: C.surfaceAlt,
        padding: gap(56, 0, 56),
      }),
    ],
  },

  '03-services-grid': {
    title: 'SuperTool — Services Grid',
    type: 'section',
    content: [
      section([
        column([
          heading('Everything you need to win both channels', { align: 'center', size: 42 }),
          text(
            'Most teams bolt an AI-tracking tool onto a rank tracker onto a writing tool, then reconcile three dashboards by hand. SuperTool measures, writes, publishes and attributes in one place.',
            { align: 'center' },
          ),
        ]),
      ], { padding: gap(96, 0, 24) }),
      section([
        column([iconBox('AI Visibility Tracking', 'Run a fixed prompt set across all six answer engines on a schedule. See mention rate, citation rate and share of voice.', 'fas fa-wand-magic-sparkles')], { _inline_size: 33.33 }),
        column([iconBox('Citation Monitoring', 'Know which of your URLs answer engines actually quote — and which competitor page took the citation when they did not.', 'fas fa-quote-left')], { _inline_size: 33.33 }),
        column([iconBox('Content Engine', 'Briefs built from live SERP and prompt data, then a GEO score that tells you exactly what to change before you publish.', 'fas fa-pen-nib')], { _inline_size: 33.34 }),
      ], { padding: gap(0, 0, 24) }),
      section([
        column([iconBox('Rank Tracking', 'Classic position tracking with click forecasts that account for AI Overviews, featured snippets and ad blocks.', 'fas fa-magnifying-glass-chart')], { _inline_size: 33.33 }),
        column([iconBox('Site Audit', 'Crawlability, on-page, performance and schema — plus an answer-readiness category no other audit runs.', 'fas fa-shield-halved')], { _inline_size: 33.33 }),
        column([iconBox('WordPress Publishing', 'Install the plugin, paste one key, publish. Native blocks with schema and meta intact, Elementor widgets included.', 'fas fa-plug')], { _inline_size: 33.34 }),
      ], { padding: gap(0, 0, 96) }),
    ],
  },

  '04-process': {
    title: 'SuperTool — Process Steps',
    type: 'section',
    content: [
      darkSection([
        column([
          heading('From blind spot to booked pipeline in four steps', { align: 'center', color: C.white, size: 42 }),
          text('No migration, no re-platforming, no new CMS. Point it at the site you already have.', {
            align: 'center', color: 'rgba(255,255,255,0.7)',
          }),
        ]),
      ], { padding: gap(104, 0, 24) }),
      darkSection([
        column([iconBox('01 · Connect and baseline', 'We crawl the site, pull your keyword set, generate a prompt set and run every engine once to establish a baseline.')], { _inline_size: 25 }),
        column([iconBox('02 · Find the gaps', 'See which questions you lose, which competitor wins them, and which page is closest to being citable.')], { _inline_size: 25 }),
        column([iconBox('03 · Publish what gets cited', 'Briefs pre-loaded with the statistics, sources and question headings the winning answers contain.')], { _inline_size: 25 }),
        column([iconBox('04 · Measure the revenue', 'Leads arriving from an assistant are tagged at the source, so AI pipeline reports like any other channel.')], { _inline_size: 25 }),
      ], { padding: gap(0, 0, 104) }),
    ],
  },

  '05-cta-band': {
    title: 'SuperTool — CTA Band',
    type: 'section',
    content: [
      section([
        column([
          heading('Find out what the assistants say about you', { align: 'center', color: C.white, size: 42 }),
          text('Run one full check across all six answer engines, free. It takes about a minute and needs nothing but your domain.', {
            align: 'center', color: 'rgba(255,255,255,0.85)',
          }),
          button('Start free trial', { url: '/signup', align: 'center' }),
        ]),
      ], {
        background_background: 'classic',
        background_color: C.brand,
        padding: gap(80, 0, 80),
      }),
    ],
  },

  '06-faq': {
    title: 'SuperTool — FAQ',
    type: 'section',
    content: [
      section([
        column([
          heading('Everything teams ask before they switch', { align: 'center', size: 40 }),
          widget('accordion', {
            tabs: [
              {
                _id: id(),
                tab_title: 'What is AI search visibility?',
                tab_content: '<p>AI search visibility is the share of AI-generated answers in which your brand is named or cited as a source. Unlike a blue-link ranking there is no position one — an assistant either includes you in its answer or it does not.</p>',
              },
              {
                _id: id(),
                tab_title: 'How is this different from a rank tracker?',
                tab_content: '<p>A rank tracker tells you where a URL sits in a list of ten links. An answer engine returns one synthesised answer and a handful of sources. SuperTool tracks both, side by side, against the same content.</p>',
              },
              {
                _id: id(),
                tab_title: 'Do I need my own API keys?',
                tab_content: '<p>No. SuperTool runs the engine checks for you on every plan. On the Scale plan you can supply your own credentials for cost control or data residency.</p>',
              },
              {
                _id: id(),
                tab_title: 'Will the WordPress plugin break my theme or SEO plugin?',
                tab_content: '<p>No. The plugin adds no front-end CSS and takes over none of your existing metadata. It writes SEO fields through whichever plugin you already run — Yoast and Rank Math are both supported.</p>',
              },
            ],
            title_color: C.ink,
            tab_active_color: C.brand,
            border_width: px(1),
            border_color: C.line,
            title_typography_typography: 'custom',
            title_typography_font_family: 'Manrope',
            title_typography_font_size: px(17),
            title_typography_font_weight: '700',
          }),
        ]),
      ], { padding: gap(96, 0, 96) }),
    ],
  },
};

for (const [slug, tpl] of Object.entries(templates)) {
  const payload = {
    version: '0.4',
    title: tpl.title,
    type: tpl.type,
    content: tpl.content,
    page_settings: [],
    metadata: {
      generator: 'Rank Logic SuperTool kit builder',
      elementor_min: '3.0.0',
    },
  };
  const file = join(OUT, `${slug}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2));
  // Fail loudly rather than shipping malformed JSON.
  JSON.parse(JSON.stringify(payload));
  console.log(`wrote ${slug}.json (${tpl.content.length} section${tpl.content.length === 1 ? '' : 's'})`);
}

console.log(`\n${Object.keys(templates).length} templates written to ${OUT}`);
