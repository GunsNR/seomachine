# Design review

**Method:** the `design-superpowers:design-review` chain (visual quality → UX heuristics → accessibility), run on screenshots from the real app.

**Environment:**
- Playwright Chromium against `next start` (production build) at 390, 768 and 1440 CSS px.
- Synthetic seed data with long names, a missing name and email, overdue states, and partial publishing.
- An in-page probe (`scripts/a11y-probe.cjs`) checks every screen for unlabeled controls, unnamed buttons/links, missing alt text, the h1 count, horizontal overflow and targets under 24px.

**Maturity:** L1 (DESIGN.md-equivalent exists: `design.md`). No DS-compliance sub-agent.

Evidence screenshots are in `replica/screens/` (1×). Earlier rounds were captured to the session scratchpad and are not committed.

## What's working

1. **Today** opens on one dark "Next up" bar with a single sienna action. Counts sit inside section headings instead of decorative KPI cards, so the first need (one action) is met in under 3 seconds.
2. **Status is text-first everywhere** ("Manual record", "Held — not sent", "Dry run — nothing is posted", "Unconfirmed — checking before any retry"). Colour is always redundant with the icon and the words.
3. **Primary action contrast:** white on Sienna 600 is 5.10:1. Raw Sienna (3.54:1 on white) never carries text on light surfaces.
4. **Client sites render in the client's own theme** (Harbor Line teal), never the Rank Logic theme.
5. **The portal on a 390px phone** offers a two-tap "Real lead / Not a real lead" grid with 44px targets and no staff navigation.

## Round 1 — prototype (Today, CRM board, lead detail)

| # | Sev | Where | Issue | Fix | Re-checked |
| --- | --- | --- | --- | --- | --- |
| 1 | P1 | CRM board, all widths | Page scrolled sideways (1698px wide at 1440). Absolutely-positioned `sr-only` labels escaped the scroller. | `relative` on the scroll container | 0px overflow at 390/768/1440 |
| 2 | P3 | Cards | Opportunity titles repeated the person's name | Title names the job only | ✓ |
| 3 | P3 | Rail | "Agency · your own s…" truncated | "Your agency" | ✓ |
| 4 | P3 | All | Next.js dev badge covered "Sign out" | `devIndicators: false` | ✓ |

## Round 2 — lead detail

| # | Sev | Issue | Fix | Re-checked |
| --- | --- | --- | --- | --- |
| 5 | P1 | "Record opt-out" rendered unstyled: `btn-${variant}` was purged by Tailwind | Literal class map in `SubmitButton` | Crop verified |
| 6 | P2 | Two sienna primaries visible at once | Header jump link made secondary | ✓ |
| 7 | P2 | Booking row 1px overflow at 390 | `minmax(0,1fr)` + `min-w-0` | 0px |

## Round 3 — all 16 screens after expansion

| # | Sev | Issue | Fix | Re-checked |
| --- | --- | --- | --- | --- |
| 8 | P1 | Reports overflowed (149px at 390): non-wrapping status chip | Chips wrap, `max-w-full` | 0px |
| 9 | P1 | Portal approvals overflowed 50px at 390: a long UTM link | `overflow-wrap:anywhere` on captions | ✓ |
| 10 | P2 | Text links 18–20px tall on mobile (below the WCAG 2.2 24px minimum) | Mobile padding on standalone links | Probe: 0 sub-24px targets (checkboxes sit inside clickable labels) |
| 11 | P2 | Editor showed "Published" as a primary button when nothing had changed | "Live version is up to date" status instead | ✓ |
| 12 | P2 | "Title (66/60)" gave no warning | "66 of 60 characters" + hint | ✓ |
| 13 | P2 | Partly-published post still offered edit and re-approve | Locked with an explanation | ✓ |
| 14 | P2 | Template invented a hashtag | Templates leave hashtags empty (research only) | ✓ |
| 15 | P1 | `#follow-up` and Settings anchors went nowhere: `Section` didn't set its id | `id` on the section element | J1 passes |
| 16 | P1 | Home canonical and sitemap pointed at a URL that 308-redirects | No trailing slash | curl ✓ |

## Round 4 — 2026-11-04: setup screens, integrations, axe

| # | Sev | Issue | Fix | Re-checked |
| --- | --- | --- | --- | --- |
| 17 | P1 | Confirmation and error messages after actions on `#anchor` targets (Settings sections, brand facts) were silently lost: the message was appended after the `#` | The message now goes before the anchor | J7b passes |
| 18 | P1 | Adding a `loading.tsx` skeleton stopped every form's redirect from navigating (Next 15.5) | Skeleton removed; recorded as G10 | J1–J8 pass |
| 19 | P2 | axe: "Brief & sources" used `<p>` inside `<dl>` | `dt`/`dd` pairs | axe 0 violations |
| 20 | P2 | Reports "no payments" state had the same `<dl>` misuse (not visible in demo data) | Fixed | Code inspection |
| 21 | P3 | Hero proof fact repeated in the proof section | Proof section shows the remaining facts | Template test |

New screens (Brand profile, Destinations, Pipeline, Workflow editor, Integrations, Clients) at 390 and 1440: 0 overflow, 0 unlabeled controls, 0 targets under 24px.

axe-core 4.14.0 (WCAG 2.0/2.1/2.2 A + AA rules) on 23 screens, staff and client portal: **0 violations**. The script now refuses to audit a screen that redirected to sign-in, which an earlier version silently did.

## Journeys exercised in the browser (26/26 checks pass)

| Journey | Checks |
| --- | --- |
| J0 keyboard | Skip link is the first focus stop with a visible outline |
| J1 | Overdue lead → open → add follow-up → done; "lost" without a reason is refused with a recoverable message |
| J2 | Public form → thanks → exactly one CRM opportunity on replay; UTM source shown; honeypot stores nothing; cross-origin post refused |
| J3 | SEO finding → preview fix (before/after) → apply → publish → re-audit → resolved |
| J4 | Client approves a post, confirms a lead, cannot open the staff CRM or the export |
| J5 | Emergency pause banner shows on every staff screen |
| J6 | Private preview refuses signed-out visitors |
| J7 | Agency creates a client → opens on its brand profile; a client-supplied fact waits for review, then is approved (new version); a pipeline stage is added; a workflow is created switched off |
| J8 | A hand-crafted `?error=` message link shows nothing |

## Design completion gate

| Dimension | Result | Evidence | Next fix |
| --- | --- | --- | --- |
| Core journeys work | **Pass** | 20/20 journey checks | — |
| Visual system applied consistently | **Pass** | Tokens only via Tailwind theme; one primary per view checked on 16 screens | — |
| Primary action and active workspace clear | **Pass** | Rail switcher / mobile header on every staff screen; "Next up" bar | — |
| Widths 390 / 768 / 1440 | **Pass** | Probe: 0 overflow on all screens in round 3 | Check 1024 and 1280 breakpoints explicitly |
| Contrast | **Pass** | `design.md` §4 table; axe color-contrast rule passes on 23 rendered screens | — |
| Focus and keyboard | **Pass (partial)** | J0; `:focus-visible` outline on all controls | Full keyboard pass through the editor and dialogs |
| States: empty, error, disabled, permission, held, fixture | **Pass** | Seen in screenshots and journeys | — |
| Loading state | **Not added** | `loading.tsx` broke action redirects under Next 15.5 (round 4, #18) | Revisit after the Next 16 upgrade |
| Screen-reader pass | **Not verified** | — | NVDA/VoiceOver pass |
| Dark mode | **Not applicable** | Light-only by design decision | — |

No known P0/P1 defect remains open.

**Open P3:** on the Harbor Line demo home page, the same approved credential appears both under the hero button and in the proof section.
