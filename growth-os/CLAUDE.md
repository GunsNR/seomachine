# Growth OS — working notes for Claude

Internal multi-client agency app for Rank Logic SEO: CRM and follow-up, content approval and publishing, a section-based site builder, SEO audits, and outcome reporting. It is a separate product from `../supertool/`. Don't import across the two.

## Read first

- `replica/spec.md` — requirement IDs, mapped to code and tests (the single checklist)
- `replica/architecture.md` — decisions, system of record, cost model
- `replica/backend.md` — setup, trust boundaries, production gates
- `replica/design.md` — tokens and rules
- `replica/design-review.md` — review rounds and the design gate
- `replica/progress.md` — current state, blockers, next action
- `src/lib/capabilities.ts` — what works **now** (mirrored in `replica/feature-matrix.md`)

## Rules that are enforced in code — keep them

- Every tenant query goes through `db` from `src/lib/db.ts`, which refuses tenant models without `workspaceId`. `systemDb` is only for auth, the job claim, and public slug lookup.
- Live switches (`LIVE_SENDING_ENABLED`, `LIVE_PUBLISHING_ENABLED`, `AI_LIVE_ENABLED`) stay off unless a written approval is recorded in `replica/progress.md`.
- Never mark something sent, published, verified or AI-generated unless it was. Templates are labelled "Template (not AI)". Dry runs are labelled "Dry run".
- Approval binds to a content hash, destinations, schedule and approver. Edits and send-backs revoke it. The worker re-checks everything at execution time.
- Money is integer minor units with an explicit currency, never summed across currencies. Won is not paid.
- Time is stored as UTC plus an IANA zone. DST rules are in spec REQ-SCH-01.
- Proof on sites renders only from approved brand facts. No invented reviews, stats, offices or guarantees.

## Verify

`npm run typecheck && npm run lint && npm test && npm run build`. For UI changes, also run `node scripts/journeys.cjs` and `node scripts/screens.mjs` against `npm start` with `npm run worker`. Tests need `TEST_DATABASE_URL` and refuse to use the dev database.
