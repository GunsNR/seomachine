# Architecture decision log

An index of decisions that constrain future work, with the reasoning and the
alternatives that were rejected. A decision without a rejected alternative is
usually a preference, not a decision.

ADRs 1–9 are recorded retrospectively from Gate 0, Gate 1 and the work that
preceded them. They document choices already made and merged, reconstructed by
reading the code — not decisions being proposed now.

Status values: `accepted`, `superseded`, `proposed`.

---

## ADR-001 — Capability registry as the source of present-tense truth

**Status:** accepted · Gate 0 · `src/lib/capabilities.ts`

**Decision.** A typed registry records every capability's status, source,
evidence, external validation and permitted marketing language. Public surfaces
generate their copy from it. `planFeatureLabel()` throws for a non-sellable id.

**Why.** Prose describing a product drifts from the product. Making the pricing
table read from the same record that holds the status means a capability cannot
be advertised into existence — the build fails first. This is not theoretical:
during Gate 1 the guard fired, and the build stayed red until three withdrawn
capabilities were removed from the plans.

**Rejected.** A documentation-only capability list (drifts silently); a linter
over marketing copy (catches wording, not the underlying claim).

---

## ADR-002 — Explicit provenance instead of a simulator fallback

**Status:** accepted · Gate 0 · `src/lib/ai/providers.ts`, `src/lib/provenance.ts`

**Decision.** Four explicit statuses — live, simulated, failed, unavailable. A
live call that fails stays failed. Simulation happens only in demo mode.

**Why.** The prior behaviour silently substituted simulated output on failure,
which made an outage indistinguishable from a measurement. Everything downstream
inherited that error.

**Rejected.** Fallback with a subtle UI marker — a marker on a chart is not read
by the person exporting the CSV.

---

## ADR-003 — Google AI Mode is unavailable, not approximated

**Status:** accepted · Gate 0 · `src/lib/ai/engines.ts`

**Decision.** The Google AI Mode surface has no API and is never answered by
another product. `envKey` and `model` are null, `accessMethod` is `none`, and it
is excluded even from the demo workspace.

**Why.** It was previously answered by the Gemini developer API. That is a
different surface with different retrieval and different output; reporting it as
Google AI Mode was a real number about the wrong thing.

**Rejected.** Gemini-as-proxy with a footnote; a scraped consumer experience
(violates terms).

---

## ADR-004 — Run identity, never date grouping

**Status:** accepted · Gate 1 · `src/lib/measurement/report.ts`

**Decision.** Every read path groups observations by run id. Trends plot one
point per run.

**Why.** Grouping by `runAt.toISOString().slice(0,10)` failed four independent
ways: it fabricated runs that never happened, destroyed before/after comparison,
silently weighted the larger of two merged runs, and split or merged purely on
the viewer's timezone.

**Rejected.** Date grouping with a run count shown alongside — the merged
average is still wrong.

---

## ADR-005 — Wilson interval for binomial rates

**Status:** accepted · Gate 1 · `src/lib/measurement/stats.ts`

**Decision.** 95% Wilson score interval on every binary rate, with the
independence assumption documented and explicitly flagged as violated. Run-to-run
variation reported separately.

**Why.** The normal approximation returns `[0,0]` at zero successes — asserting
certainty from evidence containing none. Samples within a run share time and
index state and are not independent, so the interval is a lower bound on
uncertainty and says so.

**Rejected.** Normal approximation (breaks at the boundary); no interval at all
(false precision); a Bayesian credible interval (defensible, but requires
choosing and defending a prior the product cannot yet justify).

---

## ADR-006 — Failed and unavailable observations count toward coverage only

**Status:** accepted · Gate 1 · `docs/measurement-spec.md` §2

**Decision.** A failed or unavailable observation never enters a rate numerator
or denominator. It is reported as coverage. Below five observations the UI states
"insufficient evidence" and shows counts rather than a percentage.

**Why.** If five of six engines are unreachable and the sixth does not name you,
"17% inclusion" describes an outage but reads as a finding.

**Rejected.** Counting failures as non-inclusions (measures uptime, reports it as
visibility); silently dropping them (hides that coverage was poor).

---

## ADR-007 — Engine availability is derived, not declared

**Status:** accepted · Gate 1 · `src/lib/ai/engines.ts`

**Decision.** An engine is available only if it has an official API, its adapter
enables the vendor's web-retrieval tool, and its model is confirmed against
first-party documentation. Availability is computed from those three facts.

**Why.** A hand-set availability flag drifts back to `true` under pressure.
Deriving it means someone has to change a fact about the engine, and the reason
is published. Applying the rule set every engine to unavailable, which is the
correct answer and was allowed to stand.

**Rejected.** A hand-maintained availability field; trusting third-party
documentation summaries when vendor domains were unreachable.

---

## ADR-008 — Legacy `AiCheck` rows are reported, never relabelled

**Status:** accepted · Gate 1 · `src/lib/measurement/report.ts`

**Decision.** Pre-Gate-1 rows have no run id, sample index, prompt snapshot or
token accounting. They are reported as a separate legacy record and excluded
from every rate, interval and trend.

**Why.** Reconstructing them into observations requires inventing the missing
fields, which would make fabricated data indistinguishable from measured data
forever.

**Rejected.** Backfilling synthetic run ids; deleting the rows (destroys history
the customer may want).

---

## ADR-009 — SQLite and `db push` are a development posture, not a production one

**Status:** accepted, with a deadline · `supertool/prisma/schema.prisma`

**Decision.** The schema is applied with `prisma db push` against SQLite. There
is no migration history. **Phase 2 must create the first reviewed PostgreSQL
migration before anything is deployed.**

**Why.** `db push` is right for a schema changing many times a day. It is wrong
the moment real customer data exists, because there is no reviewed, reversible
path between schema versions.

**Rejected.** Fabricating a migration history retroactively — a migration that
has never run against real data provides false confidence.

---

## ADR-010 — The roadmap is code, and it cannot upgrade a claim

**Status:** accepted · Phase 0 · `src/lib/roadmap.ts`

**Decision.** Phases, states, dependencies, delivered capabilities, acceptance
criteria and external blockers live in a typed module.
`tests/constitution.test.ts` enforces that a capability is sellable only if the
phase delivering it is `complete`.

**Why.** A roadmap in Markdown drifts in one direction: planned work acquires the
present tense, and eventually a roadmap row is read as a shipping statement. Gate
0 removed that class of claim from marketing; without this, a planning document
becomes the way it returns. Binding the two means adding something to a future
phase is evidence it is *not* available.

**Rejected.** A roadmap document with a status column (unenforceable); issue
tracker labels (outside the repository, invisible to CI).

---

## ADR-011 — Evidence fields must resolve to real files

**Status:** accepted · Phase 0 · `tests/constitution.test.ts`

**Decision.** Every path-shaped token in a capability's `evidence` field must
exist. Sellable capabilities must cite at least one.

**Why.** `evidence` was prose. Prose survives a file rename; a resolved path does
not. A capability sold on the strength of a test file that no longer exists is
sold on nothing.

**Rejected.** Manual review at release time (does not scale, and release time is
the worst moment to discover it).

---

## How to add an ADR

Append. Never edit an accepted decision in place — supersede it with a new entry
and mark the old one `superseded`, keeping the original reasoning visible.

An ADR is warranted when a choice constrains future work, is expensive to
reverse, or will otherwise be re-litigated by whoever arrives next. A decision
that weakens a §3 invariant of the constitution requires an ADR and cannot be
made in passing.
