# Rank Logic Growth OS

An internal, multi-client agency app. It covers:
- capturing leads and following up on them
- turning leads into appointments, proposals and sales
- proving results to clients honestly
- building and editing client landing pages
- running bounded SEO audits

Everything runs locally with **no paid services**. Sending, posting and AI are off until you approve them.

## Start it

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, `DIRECT_URL` and `AUTH_SECRET` (see `replica/backend.md`). Then:

```bash
npm run setup
```

```bash
npm run dev
```

In a second terminal:

```bash
npm run worker
```

Open http://localhost:3100.

**Demo logins (local only, fictional data):**
- `owner@ranklogic.example` — staff
- `client@harborline.example` — client portal

The password for both is whatever you set as `SEED_PASSWORD` in `.env` before running `npm run setup`.

## What's where

| Screen | What it's for |
| --- | --- |
| Today | The next useful action, overdue follow-ups, new leads, appointments, proposals, problems |
| CRM | Pipeline board and list, lead pages, follow-ups, bookings, proposals, outcomes and payments |
| Content | Brief → draft → review → approval → queue, with per-destination status |
| Websites | Section editor, preview, versions, publish, rollback, export |
| SEO | Audits, evidence-backed findings, previewing a fix on hosted pages |
| Reports | Outcomes by step and source, collections, coverage, freshness |
| Settings | Emergency pause, workflows, members and invites, AI budget, system health, capabilities |
| Portal (clients) | Confirm leads and sales, approve work, see results |

What works today vs. what's planned: Settings → Capabilities, or `replica/feature-matrix.md`.
