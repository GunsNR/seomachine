# Progress

Last updated 2026-11-03.

- **Branch:** `claude/exciting-feynman-xxffim`
- **Baseline:** `seomachine@211fc45`

## Milestones

| Milestone | State | Evidence |
| --- | --- | --- |
| M0 discovery and scope | Done | `skill-plan.md`, `architecture.md`, `research/vendor-capabilities.md`, `feature-matrix.md` |
| M0.5 design foundation | Done — passed its gate | `design.md`, `design-review.md` rounds 1–2 |
| M1 sales foundation | Done (fixture-tested) | Acceptance 1–4, 6, 9; J1, J2, J4; persistence across restart |
| M2 website | Done (fixture-tested) | Acceptance 10; J2, J3; export route |
| M3 content | Done with dry-run adapter; real adapter deferred | Acceptance 5, 7, 11 |
| M4 SEO | Done for owned sites; GSC/GA4/Ahrefs deferred | Acceptance 10; J3 |
| M5 integrated verification | Done locally; code review fixed (10/10) | See checks below |

## Round 2 (2026-11-04): "implement everything"

| Area | Done |
| --- | --- |
| Security | Production `npm audit`: 0 vulnerabilities (overrides + zod 4) |
| Setup | Client workspaces, brand facts review, destinations, pipeline stages, workflow builder, deal assignment |
| Integrations | ContentStudio (text posts), Resend email, Search Console CSV import, AI drafting + page edits, manual hand-off package |
| Gates | Signed flashes, trusted-proxy IP, allowed origins, retention purge, `/api/health`, CI workflow, axe audit |
| Review | Second high-effort review: 10 findings, all fixed with tests |

## Checks run on the final commit

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 95/95 |
| `npm run build` | pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `node scripts/journeys.cjs` (production build + worker) | 26/26 |
| `node scripts/axe.cjs` (WCAG 2.2 AA) | 23 screens, 0 violations |
| Layout probe on new screens, 390 + 1440 | 0 overflow, 0 unlabeled, 0 targets under 24px |
| Code reviews (high) | Round 1: 10/10 fixed · Round 2: 10/10 fixed |

**Not run:**
- any live provider call (no keys)
- the GitHub Actions workflow itself (it runs when this is pushed)
- a screen-reader pass
- load testing

## Still needs you

1. **ContentStudio:** buy the API plan ($15/mo on their page, 2026-11-03) and paste the key, or stay on manual hand-off.
2. **Resend:** add and verify your sending domain, add a DMARC record, paste the key.
3. **Approve live switches**, each with written scope (which workspaces, volume or budget, stop conditions):
   - `LIVE_SENDING_ENABLED`
   - `LIVE_PUBLISHING_ENABLED`
   - `AI_LIVE_ENABLED` plus a monthly cap
4. **Hosting:** pick a host. Then set `TRUST_PROXY_HOPS` and `APP_ORIGIN`, and apply migrations there (needs your OK).

## Deliberately not done

- **Postgres row-level security (G4).** Plan in `backend.md`.
- **Route loading skeletons (G10).** Broke form redirects under Next 15.5.
- **Search Console API sync, GA4, Ahrefs, calendar, SMS, images/video via ContentStudio.**

## Next action

Pick one consenting client and create their workspace in Settings → Clients. Add 5–10 facts they confirmed. Done when their site preview shows only those facts.
