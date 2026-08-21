# Rank Logic SuperTool

An AI search visibility and SEO platform. It measures how often answer engines
name your brand, grades whether your pages can be quoted by one, and publishes
to WordPress.

Runs with zero API keys. Every answer-engine check has a live path that
activates when its credential is set, and a deterministic simulator otherwise —
anything simulated is labelled as such in the UI and in the API response.

---

## Quick start

```bash
npm install
cp .env.example .env          # set AUTH_SECRET (openssl rand -base64 48)
npm run setup                 # generate client, create schema, seed demo data
npm run dev
```

Open http://localhost:3000. Sign in to the dashboard at `/login` with
`demo@ranklogicsupertool.com` / `supertool-demo`, or create a real account at
`/signup` and go through onboarding.

---

## What is in here

| Area | Path | What it does |
| --- | --- | --- |
| Marketing site | `src/app/(marketing)` | 37 prerendered routes, full schema markup, two working free tools |
| Dashboard | `src/app/app` | Overview, AI visibility, citations, keywords, rankings, backlinks, audit, content, leads, settings, account |
| Analysis engine | `src/lib/seo` | Readability, keyword analysis, difficulty and opportunity models, crawler, audit rules, GEO scoring, brief generation |
| Answer engines | `src/lib/ai` | Six engine adapters, answer analysis, prompt-set generation |
| Public API | `src/app/api/v1` | What the WordPress plugin talks to |
| WordPress plugin | `../wordpress/rank-logic-supertool` | Publishing, schema, attribution, Elementor widgets |

### The two scores

**On-page SEO** is the familiar one: title, meta, headings, keyword placement
and distribution, links, images, readability, length against the ranking set.

**GEO** grades whether an answer engine could lift a passage from the page and
attribute it to you. Nine weighted signals — a direct answer up front,
verifiable statistics, named sources, self-contained passages, question-shaped
headings, explicit entity naming, machine-readable structure, topical depth and
plain-language clarity. Each one reports the specific change that moves it.

---

## Configuration

Only `DATABASE_URL` and `AUTH_SECRET` are required. See `.env.example` for the
full list with explanations.

| Variable | Effect if unset |
| --- | --- |
| `AUTH_SECRET` | Required. The app refuses to boot in production without it. |
| `ENCRYPTION_KEY` | Falls back to `AUTH_SECRET` for encrypting stored credentials. |
| `CRON_SECRET` | Scheduled runs stay disabled rather than defaulting open. |
| `OPENAI_API_KEY` and the other five | That engine runs simulated instead of live. |
| `DATAFORSEO_LOGIN` / `SEMRUSH_API_KEY` | Keyword metrics are modelled in-product and labelled "estimated". |

### Scheduled visibility runs

Point any scheduler at the endpoint hourly. It works out which projects are
actually due from their plan frequency and last run, so hourly triggering does
not mean hourly checks.

```bash
curl -H "X-Cron-Secret: $CRON_SECRET" https://yourdomain.com/api/cron/run-checks
```

On Vercel, add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/run-checks", "schedule": "0 * * * *" }] }
```

---

## Deploying

The app is a standard Next.js 15 application and runs anywhere Node 22 does.

**Database.** SQLite by default so it runs with no infrastructure. For anything
multi-instance, switch to Postgres: change the provider in
`prisma/schema.prisma` to `postgresql`, point `DATABASE_URL` at your instance,
and run `npx prisma db push`. No schema changes are needed.

**Before going live:**

1. Set `AUTH_SECRET` to a real random value, and `NEXT_PUBLIC_SITE_URL` to your
   domain — canonicals, sitemaps and Open Graph tags all read from it.
2. Set `CRON_SECRET` and schedule the endpoint above.
3. Replace the placeholder marketing figures in `src/content/site.ts` — review
   counts, result percentages and testimonials are illustrative, not real.
4. Rebrand in `brand.config.ts`. Name, domain, colours, contact details and
   schema markup all derive from that one file.
5. Move rate limiting to a shared store if you run more than one instance. The
   built-in limiter is per-process by design; the trade-off is documented at
   `src/lib/rate-limit.ts`.

**Note on multi-instance:** everything else is stateless. The only per-process
state is the rate limiter above.

---

## WordPress

Two independent integrations — use either or both.

**Publishing** needs no plugin. Connect a site in Settings with a WordPress
application password (Users → Profile → Application Passwords). Credentials are
verified before they are saved and stored encrypted with AES-256-GCM. Articles
publish as native blocks; re-publishing updates the same post rather than
creating a duplicate.

**The plugin** (`../wordpress/rank-logic-supertool`) adds schema injection,
SEO-field passthrough to Yoast or Rank Math, cookieless AI-referral
attribution, and three Elementor widgets showing live visibility data. It adds
no front-end CSS and takes over none of your existing metadata. Setup guide at
`/docs/wordpress`.

---

## Development

```bash
npm run dev          # dev server
npm test             # 203 tests
npm run typecheck
npm run lint
npm run build
npm run db:seed      # reset demo data
```

Tests cover the analysis engine directly, plus integration tests that run the
crawler and the WordPress client against real local HTTP servers rather than
mocks.

CI runs all of the above on every push touching `supertool/`, then boots the
server and smoke-tests health, the key public routes, and that the dashboard
refuses an unauthenticated request.

---

## Security notes

- Passwords are bcrypt at cost 12. Login compares against a dummy hash when the
  user does not exist, so response time does not reveal registered emails.
- Sessions are signed JWTs in httpOnly cookies.
- Project API keys are 24 random bytes, stored only as a SHA-256 digest,
  compared in constant time, and shown once.
- Every dashboard and plugin query is org- or project-scoped. A guessed id is
  indistinguishable from a missing one.
- Endpoints that fetch a user-supplied URL refuse loopback, RFC1918,
  link-local, CGNAT and IPv6 private ranges, so neither can be used to probe
  internal networks.
- Lead attribution re-derives the engine from the referrer server-side, so a
  forged field cannot invent a channel.
