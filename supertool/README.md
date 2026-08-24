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
| `STRIPE_SECRET_KEY` | Self-hosted mode: billing disabled, every feature unlocked. |
| `STRIPE_WEBHOOK_SECRET` | The webhook refuses to run rather than trusting unsigned events. |
| `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` | Mail is logged to the console instead of sent. **Password reset will not reach real users.** |
| `OPENAI_API_KEY` and the other five | That engine runs simulated instead of live. |
| `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | Keyword metrics are modelled in-product and labelled "est." in the UI. |

### Billing

Entitlements follow the Stripe subscription — the `plan` column is a cache that
only the webhook writes, so nothing on the client can grant itself a tier.

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and a price id per plan and
interval, then point a Stripe webhook at `/api/billing/webhook` subscribed to
`checkout.session.completed`, `customer.subscription.*` and `invoice.*`.

Locally: `stripe listen --forward-to localhost:3000/api/billing/webhook`.

A lapsed trial or failed payment does **not** lock a customer out. Reads and
exports stay open — the privacy policy promises they can retrieve their data —
and only the actions that consume resources (engine checks, crawls, publishing)
are paused.

### Email

Set either `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN`, plus an `EMAIL_FROM` on
a domain you have verified with that provider. With neither, mail is printed to
the server console rather than silently dropped, which is fine in development
but means **password reset cannot reach a locked-out user** — set one before
launch. `/api/health` reports which provider is active.

### Keyword data

Without a provider, volume, difficulty and CPC come from an in-product model
driven by phrase length and commercial intent. Those rows are labelled `est.`
in the UI and carry `dataSource: "estimated"` in exports, so they are never
presented as measurements. With DataForSEO credentials set, real figures are
fetched and a provider outage degrades to the model rather than failing the
request.

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

**Database.** PostgreSQL is the required datasource — there is no SQLite mode
and no provider to switch. The schema lives in a reviewed migration history
under `prisma/migrations`.

Two connection strings, because two kinds of work need different things:

| Variable | Used for | Pooled? |
| --- | --- | --- |
| `DATABASE_URL` | Runtime application traffic | Yes, where your provider offers a pooled endpoint |
| `DIRECT_URL` | Migrations, `pg_dump`, `pg_restore`, administration | **No** — must be a direct connection |

A transaction-mode pooler multiplexes statements across backends, which breaks
advisory locks, temp tables, prepared statements and `SET` — all of which
migrations use, and the resulting failures look intermittent rather than
obvious. Set the two variables to the **same** value only when your provider has
no separate pooled endpoint; Prisma requires `DIRECT_URL` once the schema
declares it, so leaving it unset is a hard error rather than a fallback.

Apply the existing reviewed migrations, then confirm the migrations and the
schema still agree:

```bash
npm run db:deploy   # prisma migrate deploy — applies existing migrations
npm run db:drift    # fails if the migrations no longer reproduce the schema
```

**Never use `prisma db push` for deployment or setup.** It applies a diff
computed from the schema file with no recorded, reviewable or reversible step,
so there is nothing to replay and nothing to roll back. `npm run db:migrate`
(`prisma migrate dev`) is for *creating* a migration during development and must
not be pointed at a deployed database. `tests/migration-safety.test.ts` fails the
build if `db push` reappears in any script, workflow, test or instruction.

The target database must use the `public` schema: the generated migrations
qualify every object as `"public"."Table"`.

Back up before applying anything to a database holding real data, and rehearse
the restore — `docs/hosted-postgres-validation.md` has the full procedure and
`npm run db:rehearse` automates it.

**Before going live:**

1. Set `AUTH_SECRET` to a real random value, and `NEXT_PUBLIC_SITE_URL` to your
   domain — canonicals, sitemaps and Open Graph tags all read from it.
2. **Configure an email provider.** Without one, a locked-out user cannot
   reset their password.
3. Configure Stripe if you intend to charge, and register the webhook.
4. Set `CRON_SECRET` and schedule the endpoint above.
5. Review the public claims in `src/content/site.ts`. Gate 0 removed the
   fabricated testimonials, review counts and result percentages that used to
   live here, and `tests/marketing-truth.test.ts` keeps them out. Anything you
   add must be allowed by the capability registry in `src/lib/capabilities.ts`.
6. Rebrand in `brand.config.ts`. Name, domain, colours, contact details and
   schema markup all derive from that one file.
7. Set `TRUSTED_PROXY_COUNT` to the number of proxies that will always sit in
   front of the app. It defaults to `0`, which ignores `X-Forwarded-For`
   entirely. Too low makes every caller share one rate-limit bucket; too high
   lets a caller choose their own. When unsure, set it too low.

**Note on multi-instance:** the app is stateless. Phase 2 moved rate limiting
to a shared database-backed counter, so limits hold across instances rather than
multiplying by the instance count. No worker process is deployed yet, so
enqueued background jobs wait until one exists.

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
npm test             # 241 tests
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
- Password reset tokens are random bytes stored only as a SHA-256 digest,
  single-use, and expire in an hour. Requesting a new one retires outstanding
  links. The request endpoint returns the same response whether or not the
  address is registered, so it cannot be used to enumerate accounts.
- Stripe webhooks are signature-verified against the raw body, and processed
  event ids are recorded so a redelivery is a no-op rather than a double
  upgrade.
