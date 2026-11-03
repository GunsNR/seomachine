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

## Checks run in this session (all on the final commit)

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 problems) |
| `npm test` | 69/69 pass (Postgres test DB) |
| `npm run build` | pass (31 routes) |
| `node scripts/journeys.cjs` | 20/20 pass (production build + worker) |
| `node scripts/screens.mjs` + a11y probe, 16 screens × 3 widths | 0 overflow, 0 unlabeled controls, 0 unnamed buttons/links, 0 console errors |
| Persistence | Postgres and app restarted; journey lead still present (DB + UI) |
| Backup/restore | `pg_dump`/`pg_restore`; row counts match on 7 tables |
| Code review (high, `211fc45..HEAD`) | 10 findings, all fixed with regression tests |

**Not run:**
- live provider calls (none authorized)
- a full axe-core audit
- a screen-reader pass
- load or performance testing
- the SuperTool CI suite (nothing under `supertool/` or `docs/` changed)

## Blocked on you (one batch)

1. **Major dependency upgrades** to clear `npm audit` highs (Prisma 7, Next 16, zod 4). See backend G1.
2. **Publishing provider.** Approve the ContentStudio API plan ($15/mo per vendor page, 2026-11-03), or choose manual hand-off for the pilot.
3. **Email.** Choose a sending provider and the domain to authenticate, before any follow-up email can go out.

## Next action

Pick one real client for the pilot and replace the Harbor Line demo brand profile with their approved facts. Done when their site preview shows only facts they confirmed.
