# Growth OS — design

Skills applied: `frontend-design` (direction, type, anti-default review),
`design-superpowers:design-review` (review chain, P0–P3 rubric, used in
`design-review.md`), `design-skills:accessibility-audit` (WCAG 2.2 AA checks).
Brand source: ADR-012 in `docs/architecture-decision-log.md` (approved palette).

## 1. Who, and what they need first

| User | Moment | First thing they need |
| --- | --- | --- |
| Izzy (owner, limited attention) | Opens the app between calls | One next action, then the short list behind it |
| Agency staff | Working leads | Overdue follow-ups, fast lead detail, one-click task |
| Client (portal) | Phone, between jobs | Confirm "was this a real lead / did it close / what was it worth" in under a minute |

Priority order mirrors the brief: capture & follow up → convert → prove →
reduce delivery work → visibility.

## 2. Information architecture

Primary navigation, fixed: **Today, CRM, Content, Websites, SEO, Reports, Settings.**
Client portal: **Leads to confirm, Approvals, Report** (no staff navigation).

```
Today ──── Next up (one action) ─ Follow-ups (overdue first) ─ New leads ─ This week ─ Needs attention
CRM ────── Pipeline board ⇄ list ─ Lead detail (contact, opportunities, timeline, tasks, booking, proposal, outcome)
Content ── Calendar ─ Review queue ─ Piece (variants, asset, approval, per-destination status)
Websites ─ Sites ─ Page editor (sections, theme, checks, versions, preview, publish)
SEO ────── Opportunity queue ─ Finding (evidence, proposal, patch preview, approve, recheck)
Reports ── Outcomes by period ─ sources ─ coverage ─ freshness
Settings ─ Workspace, members, live switches, pause, workflows, integrations, budget, capability matrix
```

The active workspace (client or agency) is always shown in the top-left of
the rail with its type, and a fixture workspace carries a "Demo data" tag.

## 3. Two directions considered

**A. Ledger (chosen).** Light work surfaces on a cool Tasman-grey canvas,
Woodsmoke ink, a narrow Woodsmoke navigation rail. Sienna is used only for the
primary action and for overdue urgency. Dense, table-first layouts; each row
reads like a line in a ledger: who, what, when, state.

**B. Night desk.** Full Woodsmoke dark UI with sienna highlights.

Why A:
- B is the "near-black + one hot accent" default the frontend-design skill
  calls out; it also limits secondary text (Corduroy on Woodsmoke is 4.9:1)
  and is tiring for daytime sales work.
- A keeps the identity (Woodsmoke rail, sienna action) and leaves colour free
  to carry *state*, which this product needs most (overdue, held, refused,
  partial, unverified).
- Reversible: tokens are semantic, so B could be a later theme.

Revision after reviewing A against the brief: I first had KPI tiles across the
top of Today. Removed: the brief rejects decorative KPI cards, and the owner's
first need is an action, not a number. Counts now sit inside the section
headings they describe.

## 4. Tokens

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `ink` | `#0c0d0e` Woodsmoke | Body text, rail | 16.99:1 on canvas |
| `ink-2` | `#646c6c` Corduroy | Secondary text | 5.38:1 on white, 4.70:1 on canvas |
| `canvas` | `#eef0ef` (Tasman, lightened) | Page background | — |
| `surface` | `#ffffff` | Panels, tables | — |
| `line` | `#dbdcdb` Tasman | Dividers, borders | non-text |
| `action` | `#b0532c` Sienna 600 (derived) | Primary buttons (white text) | 5.10:1 |
| `action-ink` | `#8f3f1f` Sienna 700 | Links / action text on white | 7.24:1 |
| `accent` | `#d16c42` Raw Sienna | Overdue bars, rail active marker, focus ring on dark | 3.54:1 on white (non-text only), 5.50:1 on Woodsmoke |
| `ok` | `#1f6f4a` | Published, paid, verified | 6.12:1 |
| `warn` | `#8a5a00` | Held, ambiguous, needs review | 5.93:1 |
| `bad` | `#b42318` | Failed, refused, blocked | 6.57:1 |
| `info` | `#1d5fa8` | Fixture/demo, scheduled | 6.45:1 |

Raw Sienna on white fails AA for text (3.54:1), so it never carries text on
light surfaces. Every status uses text + icon, never colour alone.

Type: **Schibsted Grotesk** (variable, self-hosted via Fontsource, no network
at runtime). One family; hierarchy by size and weight. Scale: 12 / 13 / 14
(body) / 16 / 20 / 24 / 30. Numbers use `tabular-nums`. Dates are always
rendered in the workspace's timezone with the zone abbreviation.

Spacing 4-pt scale; radius 6px controls, 10px panels (two radii, by
hierarchy, not one radius everywhere); one elevation (panel border, no drop
shadows except dialogs). Motion: 120ms colour/opacity transitions on
interaction only; none when `prefers-reduced-motion`.

Icons: Lucide, 16px, 1.75 stroke, always paired with a text label in
navigation and on ambiguous actions.

The one memorable element: the **Next up bar** on Today — a single
Woodsmoke strip with one sentence and one sienna button. Everything around it
stays quiet.

## 5. Component states

Every data component designs: loading (route-level skeleton), empty (says what
to do), populated, error (what happened + how to recover), disconnected
(integration not connected → "Set up in Settings"), saved (inline
confirmation), disabled (reason shown next to the control, not only a greyed
button), permission-restricted (explains who can do it), fixture (labelled
"Demo data"), held/blocked (reason text).

Status chips are text-first: `● Overdue 3d`, `Held — no verified sender`,
`Dry run — nothing posted`, `Manual booking (not a calendar reservation)`.

## 6. Responsive behaviour

| Width | Layout |
| --- | --- |
| ≥ 1200 | Rail 224px + content max 1240px; lead detail two columns (record ⟷ timeline) |
| 768–1199 | Rail collapses to 64px icons with labels in tooltips + visible on focus; pipeline board scrolls horizontally inside its panel |
| < 768 | Rail becomes a bottom tab bar (Today, CRM, Content, SEO, More); lead detail single column with actions first; board becomes a stage-grouped list |

Touch targets ≥ 44px on mobile. No horizontal page scroll at 390px.

## 7. Core journeys (must work end to end)

1. Overdue lead → open lead detail → create follow-up task (or complete) → back to Today with the item gone.
2. Content in review → open → approve for named destinations and time, or reject → status visible per destination.
3. SEO finding → evidence → preview proposed patch (before/after) → apply → recheck.
4. Client portal: confirm qualified / won / job value / payment received.

## 8. Visual acceptance checklist

- [ ] Active workspace and its type visible on every staff screen
- [ ] One primary (sienna) action per view at most
- [ ] No decorative KPI cards, gradients, glass, or pill clutter
- [ ] Every status has text + icon; colour is redundant
- [ ] 390 / 768 / 1440: no clipping, no horizontal page scroll
- [ ] Visible focus on every interactive element; skip link present
- [ ] Empty, error, disabled and permission states written in plain language
- [ ] Client websites render in the client theme, never the Rank Logic theme
