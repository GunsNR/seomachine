# Rank Logic SuperTool

An AI search visibility and SEO platform. It measures how often ChatGPT,
Perplexity, Claude, Gemini, Grok and Google AI Mode name your brand, scores
your content for whether an answer engine could quote it, audits your site,
tracks classic rankings, and attributes the leads either channel produces.

Built as three deliverables:

| Piece | Location | What it is |
| --- | --- | --- |
| **Web app** | `supertool/` | Next.js 15 marketing site + SaaS dashboard |
| **WordPress plugin** | `wordpress/rank-logic-supertool/` | 5-minute connector with Elementor widgets |
| **Elementor kit** | `wordpress/elementor-kit/` | Six importable sections matching the design |

## Quick start

```bash
cd supertool
npm install
cp .env.example .env          # then set AUTH_SECRET
npm run setup                 # generate client, create schema, seed demo data
npm run dev                   # http://localhost:3000
```

Sign in to the dashboard at `/login` with:

```
demo@ranklogicsupertool.com / supertool-demo
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Vitest suite (111 tests) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run setup` | Prisma generate + db push + seed |
| `npm run db:seed` | Re-seed demo data (idempotent) |

## How it works without API keys

Every answer engine has two paths: a live one that activates when its
credential is set, and a **deterministic simulator** seeded on
prompt + engine + day. That means:

- The product is fully functional and demoable with zero credentials.
- Simulated results are stable across reloads, so screenshots and tests reproduce.
- Anything simulated is labelled as such in the UI and in the API response.

Set the keys in `.env` (see `.env.example`) to run against the real engines.
Engines can be enabled individually — a partial configuration is a valid state.

## Architecture

```
supertool/
├── brand.config.ts            Single source of truth for naming and palette
├── prisma/schema.prisma       17 models; SQLite by default, Postgres-ready
├── src/
│   ├── app/
│   │   ├── (marketing)/       Public site — 37 prerendered routes
│   │   ├── (auth)/            Login and signup
│   │   ├── app/               Authenticated dashboard
│   │   └── api/
│   │       ├── tools/         Public free tools (audit, AI check)
│   │       ├── app/           Dashboard actions
│   │       └── v1/wordpress/  Plugin-facing API (key-authenticated)
│   ├── components/            Marketing, dashboard and shared UI
│   ├── content/               All marketing copy, as data
│   └── lib/
│       ├── seo/               Analysis engine (see below)
│       ├── ai/                Answer-engine adapters and measurement
│       ├── auth.ts            JWT sessions, bcrypt passwords
│       └── apikey.ts          Hashed project keys for the plugin
└── tests/                     111 unit + integration tests
```

### The analysis engine

Everything under `src/lib/seo/` is dependency-light and directly testable:

- **`text.ts`** — tokenisation, sentence splitting that survives abbreviations
  and decimals, and five readability formulas (Flesch, Flesch-Kincaid,
  Gunning Fog, SMOG, ARI) with a consensus grade.
- **`keywords.ts`** — n-grams, density, stuffing verdicts scaled to document
  length, quartile distribution scoring, competitor content gaps, intent
  classification.
- **`metrics.ts`** — an AI-Overview-aware CTR curve, keyword difficulty from
  incumbent link authority, domain authority, traffic and dollar value
  forecasts, and the eight-factor opportunity score.
- **`ai-readiness.ts`** — the GEO model: nine weighted signals that decide
  whether an answer engine can lift and attribute a passage.
- **`content-score.ts`** — seventeen on-page checks with SERP-benchmarked
  length targets.
- **`crawler.ts` / `audit.ts`** — a polite breadth-first crawler and twenty-plus
  severity-weighted rules across five categories, including answer-readiness.

### Measurement, not vibes

`src/lib/ai/analysis.ts` parses an assistant's answer for brand mentions,
citations of your own domain, competitor mentions, mention rank and sentiment.
Mentions are counted over prose with URLs stripped, so a vendor's domain
appearing in a source list is scored as a citation rather than double-counted
as a second mention.

Individual checks roll up into a 0-100 visibility score weighting mention rate
(40%), citation rate (25%), share of voice (20%) and rank quality (15%).

## SEO posture

- All 37 marketing routes are statically prerendered; first-load JS is ~102 kB shared.
- Per-page canonical URLs, Open Graph and Twitter cards from one metadata helper.
- JSON-LD for Organization, WebSite, SoftwareApplication, BreadcrumbList,
  FAQPage and BlogPosting.
- `robots.txt` explicitly allows GPTBot, OAI-SearchBot, PerplexityBot,
  ClaudeBot and Google-Extended — the product's own thesis, applied to itself.
- Generated sitemap covering every route including dynamic ones.
- Build-time OG image generation, so no binary assets are committed.

## Security notes

- Passwords: bcrypt, cost 12. Login compares against a dummy hash when the user
  is absent so response time does not reveal registered emails.
- Sessions: signed JWT in an httpOnly, SameSite=Lax cookie. `AUTH_SECRET` is
  required in production and the app refuses to start without it.
- Project API keys: 24 random bytes, stored only as a SHA-256 digest, compared
  in constant time, shown to the user exactly once.
- Every dashboard and plugin query is scoped by organisation or project, so a
  guessed id cannot cross tenants.
- The public audit tool refuses loopback, link-local and RFC1918 targets, so it
  cannot be used to probe internal networks.
- Provider credentials are read server-side only and never reach the browser.

## Deployment

Works on any Node 20+ host. For Vercel: set the environment variables from
`.env.example`, switch the Prisma provider to `postgresql`, and point
`DATABASE_URL` at a hosted database.

```bash
npm run build && npm start
```
