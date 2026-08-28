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

**Superseded in part by ADR-014 (Phase 2).** The production half of this
decision no longer holds: the product runs on PostgreSQL with a reviewed
migration history. The reasoning below is kept because it is why the change was
sequenced this way, and it remains correct about local development.

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

## ADR-012 — The canonical palette is decided; implementation waits for Phase 5

**Status:** accepted · Phase 0 · product owner, 2026-08-24

**Decision.** The Rank Logic brand identity is Woodsmoke `#0c0d0e`, Raw Sienna
`#d16c42`, Tasman `#dbdcdb`, Corduroy `#646c6c`. The runtime UI is **not**
changed now. `supertool/brand.config.ts` keeps its current cool scheme until
Phase 5 builds and visually tests the responsive design system, which is where
the canonical palette is implemented.

The existing blue may remain afterwards as a functional or data-visualization
colour if Phase 5 accessibility and UX testing justifies that narrower role. It
is not the primary brand identity.

**Why.** Two things were being conflated: *what the brand is* and *what the code
renders*. The first is a brand decision and is now made. The second touches
every rendered surface simultaneously, so doing it outside a full design pass
would ship an untested visual regression with no contrast verification behind
it. Separating them lets the identity be settled and recorded without putting an
unverified change into the product.

**Rejected.** Swapping `brand.config.ts` immediately — one file, but it
repaints the entire product with no visual-regression coverage and no measured
contrast, and Phase 0 is documentation-only by its own definition of done.

**Consequences.** Phase 5 inherits a fixed palette rather than an open question.
Any future identity change requires a superseding ADR.

---

## ADR-013 — `brand.identityVerified` stays false until real, reviewed identity exists

**Status:** accepted · Phase 0 · product owner, 2026-08-24

**Decision.** `brand.identityVerified` remains `false`. No placeholder postal
address or phone number is published, and none enters `Organization` structured
data. Address, phone, legal pages and identity verification are deferred until
the real information exists and has had legal review.

**Why.** Gate 0 found placeholder contact details being emitted as schema.org
`Organization` markup. Structured data is a machine-readable assertion about a
real-world entity; a fabricated address there is a false statement to search
engines and to anyone consuming the markup, not merely unfinished copy. The
existing gate in `src/lib/metadata.ts` and the incomplete-page notice in
`LegalPage.tsx` are the correct behaviour and stay.

**Rejected.** Filling in plausible details to make the pages look finished —
this is precisely the fabrication Gate 0 removed.

**Consequences.** Legal pages continue to render their incomplete-information
notice. Setting this flag true later requires confirming each field against real
records, and is a Phase 3 or later concern.

---

## ADR-014 — PostgreSQL with a reviewed migration history

**Status:** accepted · Phase 2 · supersedes the production half of ADR-009

**Decision.** The product runs on PostgreSQL. Schema changes are applied with
`prisma migrate deploy` against a recorded migration history in
`supertool/prisma/migrations`. `prisma db push` is no longer a deployment
mechanism anywhere, and CI runs `migrate deploy` plus a drift check on every
push.

**Why.** `db push` computes a diff and applies it with no recorded, reviewable,
reversible step. That is the correct trade while prototyping — it was, and
ADR-009 said so — and the wrong one the moment data exists that cannot be
regenerated. A migration file is reviewable before it runs, replayable in the
same order everywhere, and the only artefact that makes "what changed" and "how
do we undo it" answerable.

The drift check matters as much as the migration. Migrations that no longer
reproduce the declared schema fail at deploy time, which is the worst moment to
find out; CI now finds out instead.

**What ADR-009 got right and keeps.** SQLite for zero-infrastructure local
development was a real benefit. The tests that mattered — run lifecycle,
idempotency constraints — have moved to throwaway PostgreSQL, because SQLite and
PostgreSQL do not enforce uniqueness, nulls or types identically, so those tests
were proving less than they appeared to.

**Corrected after the fact.** This entry originally said those tests use
throwaway *schemas*. They cannot. The migration-safety follow-up switched them
from `db push` to `migrate deploy` — the command production runs — and that
revealed the constraint: Prisma bakes the schema name in at generation time, so
every generated migration qualifies its objects as `"public"."Table"`.
`migrate deploy` against `?schema=test_abc` records `_prisma_migrations` in
`test_abc` while creating the tables in `public`, and the second test file to
run fails with `relation "User" already exists`. Isolation is therefore one
disposable *database* per test file, not one schema. The same constraint applies
to any hosted target: it must use the `public` schema.

**Rejected.** Keeping `db push` behind a "production" flag (the flag is the bug);
hand-written SQL migrations outside Prisma (drift becomes undetectable).

**Not yet done.** No migration has run against a copy of production-shaped data,
because none exists. That rehearsal remains an open Phase 2 acceptance criterion.

---

## ADR-015 — Phase 2 does not depend on Phase 1

**Status:** accepted · Phase 2

**Decision.** `phase-2` depends on `phase-0` only. The roadmap previously
declared `dependsOn: ['phase-1']`.

**Why.** The original sequencing assumed provider activation came first because
it is the more visible work. Nothing about migrations, durable jobs, tenancy,
session revocation or SSRF defence needs a grounded provider. Meanwhile Phase 1
is blocked on credentials, per-call spend, egress to vendor documentation and
legal review — none of which can be obtained from inside the repository.

Encoding a dependency that does not exist would have parked every piece of work
that *can* be done behind work that cannot. The dependency graph should describe
real constraints, not the order someone first imagined.

**Consequences.** Phase 1 remains the next product-capability phase and remains
externally blocked. Phase 3 still depends on Phase 2, which is now accurate
rather than transitively true through a fiction.

---

## ADR-016 — The socket is pinned to the address the guard approved

**Status:** accepted · Phase 2 · `src/lib/net-pinned.ts`, `src/lib/ip-address.ts`

**Decision.** Outbound requests to user-supplied URLs resolve the hostname once
through a controlled resolver, validate every address returned, and then open
the connection to the validated address. The HTTP client is `node:http` /
`node:https` with a per-request `lookup` that returns the pinned address and
never consults DNS. `fetch` is no longer used for these requests.

**Why.** Validating a hostname and then handing that hostname to a client that
resolves it again is a time-of-check/time-of-use bug. An attacker who controls
the authoritative DNS for a name they own answers the guard's lookup with a
public address and the client's lookup with `169.254.169.254`. Every check the
guard performed described an address the request never used. The only fix is
for the checked address and the connected address to be the same value, which
means the address has to reach the socket.

Node's `fetch` cannot express this. The `dispatcher` option that would allow it
requires an `undici` dependency the project does not carry, so the transport
was moved to the core HTTP modules, where `lookup` is a documented per-request
option.

**What is deliberately not pinned.** The hostname. `options.host` stays the
name, so TLS SNI, certificate validation and the `Host` header are unchanged;
only the TCP peer is substituted. Pinning by rewriting the URL to the IP — the
obvious shortcut — disables certificate validation and trades an SSRF hole for
a transport-security hole.

**Consequences.** Response bodies are buffered under an explicit byte cap
rather than streamed, and `Content-Encoding` is decompressed in-process with
the cap applied to the decoded bytes as well, because a compression bomb
exhausts memory before any decoded limit is consulted. Redirects were already
followed manually; each hop now resolves, validates and pins independently.
`allowPrivateHosts` disables validation only — the pin still applies, since a
request whose destination is unknowable is not made safer by skipping a check.

**Also closed here.** The address parser this depends on replaced a
dotted-quad regex, which had recognised exactly one spelling of an address.
`127.1`, `0177.0.0.1`, `0x7f000001` and `2130706433` all reach loopback through
`getaddrinfo` and were previously treated as ordinary hostnames; so was
`::ffff:7f00:1`, which is the IPv4-mapped form the WHATWG URL parser actually
produces — meaning the old mapped-address check could not fire on a parsed URL.
IPv6 is now allow-listed to global unicast rather than block-listed.

**Rejected.** Adding `undici` to gain a dispatcher (a dependency for one
option); re-checking the address after connecting via `fetch` (there is no such
hook); accepting the race as residual (it was recorded as residual for one
release and is the last SSRF item on the Phase 2 criterion).

---

## How to add an ADR

Append. Never edit an accepted decision in place — supersede it with a new entry
and mark the old one `superseded`, keeping the original reasoning visible.

An ADR is warranted when a choice constrains future work, is expensive to
reverse, or will otherwise be re-litigated by whoever arrives next. A decision
that weakens a §3 invariant of the constitution requires an ADR and cannot be
made in passing.
