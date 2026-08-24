# UX and design system

Governed by `docs/product-constitution.md` §7. Delivered by Phase 5; this
document is the specification Phase 5 will be judged against, not a description
of what the interface is today.

---

## 1. Principles

1. **Action-first.** Default to the few most valuable next actions, not a wall
   of charts. A dashboard that shows everything decides nothing.
2. **Progressive disclosure.** A business owner sees clarity; an expert opens
   the full evidence. Same screen, different depth.
3. **One vocabulary.** A metric means one thing everywhere. "Inclusion rate" has
   exactly the definition in `docs/measurement-spec.md` §2, on every surface.
4. **Visible trust.** Source, freshness, coverage, confidence and data state are
   always reachable — not buried in a tooltip nobody opens.
5. **Reversible execution.** Preview, approve, publish, verify, roll back. No
   irreversible action without an explicit confirmation that names what will
   change.
6. **Mobile-capable.** Review, approval, alerts and reporting must work on a
   phone. Agency owners approve work between meetings.
7. **Accessible.** WCAG 2.2 AA, full keyboard operation, visible focus, semantic
   structure, sufficient contrast, reduced-motion support, understandable errors.
8. **Fast.** p75 LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 on priority pages, enforced
   in CI or observability rather than asserted.
9. **Complete states.** Every one of the eleven states in §4 is designed.
10. **No vanity complexity.** Remove anything that does not improve
    comprehension, decision quality, trust or conversion.

---

## 2. Target information architecture

Current navigation is a flat list of twelve dashboard routes. The target groups
them around the work rather than the data source:

| Section | Contains | Exists today |
| --- | --- | --- |
| Home | Portfolio health, what changed, freshness | `/app` (partial) |
| Action Center | The single prioritized queue across every module | No |
| Research | Keywords, topics, questions, gaps, prompts | `/app/keywords` (partial) |
| Visibility | Google rankings and AI answer engines together | `/app/rankings`, `/app/ai-visibility`, `/app/citations` (split) |
| Site Health | Crawl, issues, Core Web Vitals | `/app/audit` (partial) |
| Content | Inventory, decay, briefs, drafts, refreshes | `/app/content` (partial) |
| Links and PR | Backlinks, mentions, outreach | `/app/backlinks` (shell) |
| Local | Locations, profiles, map visibility | No |
| Competitors | Sets, comparison, change alerts | No |
| Analytics | GSC, GA4, conversions, attribution | No |
| Publish | Destinations, queue, history, rollback | Partial, inside content |
| Reports | Templates, schedules, client views | No |
| Integrations | Connections and their health | `/app/settings` (partial) |
| Settings | Org, members, billing, API keys | `/app/settings`, `/app/account`, `/app/billing` |

Labels and grouping are validated by card sorting and task testing before they
are locked. This table is a hypothesis, not a decision.

### The question every analysis screen answers

- What changed?
- Does it matter?
- Why did it happen?
- What evidence supports that conclusion?
- What should I do next?
- Can Rank Logic help execute it safely?
- Did the action work?

A screen that cannot answer the first and fifth is a report, not a product
surface.

---

## 3. Visual direction

**The canonical Rank Logic palette is decided.** The product owner settled this
on 2026-08-24; see ADR-012.

| Role | Colour |
| --- | --- |
| Woodsmoke | `#0c0d0e` |
| Raw Sienna | `#d16c42` |
| Tasman | `#dbdcdb` |
| Corduroy | `#646c6c` |

The codebase currently renders a different, cool scheme — Navy `#07182E`, Brand
blue `#1466D8`, Accent orange `#FF6B2C`, Ink `#0B1220`, Body `#4A5568`, Line
`#E3E8EF` — held in `supertool/brand.config.ts`. That is the *implementation*,
not the identity, and it stays exactly as it is until Phase 5.

The reason for the gap is deliberate. Swapping the palette touches every
rendered surface at once, and doing it outside a full design pass would produce
an untested visual regression with no contrast verification behind it. Phase 5
is where the responsive design system is built and visually tested, and that is
where the canonical palette lands. Nothing before Phase 5 may change it, and
nothing after Phase 5 may ship a different identity without a superseding ADR.

The existing blue is not deleted by this decision. It may survive as a
functional or data-visualization colour if Phase 5's accessibility and UX
testing justifies keeping it in that narrower role — but it is not the primary
brand identity and must not be presented as one.

Whichever role each colour takes must pass contrast testing before it ships. Raw Sienna
`#d16c42` on Woodsmoke `#0c0d0e` is roughly 5.6:1 and passes AA for normal text;
Corduroy `#646c6c` on Woodsmoke is roughly 4.9:1 and passes AA for normal text
but not AAA. Those figures are computed, not measured on the rendered product,
and must be re-verified against real components.

### Rules that hold regardless of palette

- Rank Logic's own design system and identity. Learn from others' clarity and
  conversion architecture; copy nobody's expression.
- Real product UI, diagrams and verified evidence. Never a decorative fake
  dashboard or invented proof — Gate 0 removed those and
  `tests/marketing-truth.test.ts` keeps them out.
- Tokenized: colour, type, spacing, radius, elevation and motion are tokens, not
  literals. `brand.config.ts` → Tailwind theme is the existing mechanism.
- Visual-regression coverage before the design system is called done.

---

## 4. The eleven states

Every data-bearing component designs all of these. Most products design two and
discover the rest in production.

| State | Meaning | Existing reference |
| --- | --- | --- |
| Loading | Request in flight | Skeletons in `src/components/app/ui.tsx` |
| Empty | No data has ever existed | `EmptyState` |
| Partial | Some observations succeeded, some did not | `RunHeader` coverage line |
| Stale | Data exists but is older than its freshness SLA | Not yet built |
| Estimated | Modelled, not measured | Keyword difficulty labelling |
| Insufficient evidence | Below the minimum for a rate | `RateTile`, `MIN_OBSERVATIONS_FOR_RATE = 5` |
| Failed | The attempt errored | `Observation.status = 'failed'` |
| Unavailable | The capability does not exist here | `CapabilityUnavailable` |
| Demo | Simulated sample data | Demo-mode labelling |
| Permission denied | Exists, not for this user | Not yet built — roles unenforced |
| Recovery | What to do about it | Partial |

Three of these — stale, permission denied and recovery — have no implementation
yet. That is a Phase 5 gap, listed here so it is not discovered late.

---

## 5. Evidence before the experience is called good

Before claiming the experience is excellent:

- Test the five most important workflows with representative users.
- Reach at least 90% unassisted completion on those workflows.
- Measure time, error rate, confidence and comprehension — not satisfaction
  alone.
- Fix critical usability failures before adding polish.
- Verify desktop and mobile against real data, empty data, partial data and
  failure states.

### The five priority workflows

1. Connect a site and reach a first truthful insight.
2. Review what changed this week and decide what matters.
3. Approve a recommended action and see it executed.
4. Publish a piece of content to WordPress and verify it landed.
5. Produce a client-ready report and share it.

Workflow 3 depends on the Action Center (Phase 5) and workflow 4 depends on
verified publishing (Phase 3). Neither can be usability-tested honestly today.

---

## 6. Marketing surface

The public site follows Search Essentials, uses original content, applies
structured data only where eligible, links internally with intent, and loads
fast and accessibly. No scaled low-value AI content.

Positioning:

> One clear system to find, prioritize, execute and prove the SEO work that
> matters across Google and AI search.

Not "every tool for everyone". The wedge is agency-first: Rank Logic runs the
platform on real client work, and that usage produces the feedback, outcome data
and — eventually, with permission — the case studies.

Marketability features that belong in the product rather than the copy: guided
onboarding that produces truthful first value quickly; a connection checklist;
role-specific tours and a labelled demo workspace; free tools that lead into the
paid workflow; shareable reports; transparent methodology and data-source pages.

Case studies come after evidence exists. Not before. `tests/marketing-truth.test.ts`
and `tests/constitution.test.ts` both enforce the absence of invented proof.

---

## 7. Accessibility and performance as gates

Both are Phase 5 acceptance criteria, and both are measured rather than
asserted:

- Automated accessibility checks in CI over priority routes, plus one manual
  keyboard-only pass per release.
- Performance budgets enforced in CI or observability. A budget that is only
  aspirational is not a budget.

---

## 8. Decisions

### Settled

1. **The palette.** Woodsmoke `#0c0d0e`, Raw Sienna `#d16c42`, Tasman `#dbdcdb`,
   Corduroy `#646c6c` is the canonical Rank Logic identity, decided 2026-08-24.
   Implementation waits for Phase 5 — see §3 and ADR-012.
2. **`brand.identityVerified` stays `false`.** Decided 2026-08-24. The postal
   address and phone number in `brand.config.ts` are placeholders, and
   publishing a fabricated business address as schema.org markup misrepresents a
   real-world entity. They stay out of structured data, and the legal pages stay
   marked as incomplete, until the real information exists and has had legal
   review. See ADR-013.

### Still open

3. **Access to representative users** for the usability testing Phase 5 requires.
