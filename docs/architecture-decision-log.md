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

Multi-address handling changed, and this is the consequence worth knowing about
in production. Previously every resolved address was validated and the *name*
was then handed to `fetch`, so Node chose an address and could fall back to
another if the first refused the connection. Now every address is still
validated, but exactly one is connected to and there is no fallback: a host
whose first address is unreachable fails rather than trying the second. Failing
over would mean connecting to an address chosen after the check, which is the
hole this ADR closes, so the fallback cannot simply be restored — a future
version that wants it must re-pin per attempt and walk the validated list
explicitly. Connection reuse is gone for the same reason: a pooled socket is a
socket opened against an earlier request's pinned address.

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

## ADR-017 — A redirect is a new request, not a replay of the old one

**Status:** accepted · Phase 2 · `src/lib/net-fetch.ts`

**Decision.** When following a redirect, `safeFetch` applies RFC 9110 §15.4
method semantics and refuses any cross-origin hop that would repeat a non-GET
method or a request body. `Proxy-Authorization` joins the credentials stripped
across an origin boundary, and DNS resolution runs inside the caller's
remaining timeout.

**Why.** ADR-016 stopped a redirect choosing an unchecked *destination*. It did
not stop a redirect choosing what got *sent* there. The guard stripped
credentials across an origin boundary but preserved the method and the body, so
a 307 — or a 302 answering a PUT — re-issued the whole request against whatever
host the redirect named. For `publishPost` that is an article body, sent to a
site chosen by whoever controls the redirect, on behalf of a customer who asked
only to publish to their own WordPress.

Method rewriting alone fixes the common case: a 303, and a 302 answering a POST,
both become GET with the body dropped, which is what every browser has done for
decades. What rewriting cannot fix is 307 and 308, whose entire definition is
that the method and body survive. There the only safe answer across an origin
boundary is to refuse, and the same reasoning covers a 301 or 302 answering a
method that is not POST, since those preserve the method too.

The resolver deadline is a smaller thing with the same shape: the budget was
read only *after* resolution returned, so a hanging name server ran past the
timeout it was supposed to obey. It now races the remaining budget. The lookup
itself cannot be cancelled and may still be in flight when the race is lost —
what matters is that no address is learned and no socket is opened.

**Consequences.** A POST that receives a 301 or 302 becomes a GET and loses its
body. That is correct and matches browsers, but it makes one real case fail
differently than before: a WordPress site stored as `http://` that redirects to
`https://` will now see the publish arrive as a GET rather than a POST, because
a scheme change is an origin change. It previously arrived as a POST stripped of
its credentials, and failed as a 401. Neither is a working publish; the fix in
both cases is to store the `https://` URL. A same-origin 307 still preserves
method and body, so ordinary same-site redirects are unaffected.

**Rejected.** Refusing every cross-origin redirect that had a body, including
ones the method rules already neutralise (stricter, but it would refuse the
http-to-https case that a downgrade to GET handles safely); stripping the body
on 307 while following it anyway (the method still says "repeat this", so the
new host receives a request nobody addressed to it); cancelling the DNS lookup
itself (`dns.lookup` offers no cancellation).

---

## ADR-018 — Measurement runs are queued work, not request work

**Accepted, 2026-08-30.**

`POST /api/app/run-check` and the cron sweep both executed a measurement inside
the HTTP request, with `maxDuration = 300`. That was the honest thing to do with
no worker, and it had three costs the customer paid. A run longer than the
platform's request ceiling was killed halfway, leaving a `partial` run and a
network error the browser rendered as "it broke". The browser tab was the only
thing that would ever report the outcome, so closing it lost the result even
though the work continued. And the cron endpoint could only ever process a
handful of projects per delivery before the platform cut it off — the batch
limit was a timeout workaround dressed up as fairness.

**Decision.** Both producers write the `MeasurementRun` row and enqueue a
`measurement.run` job. A worker process claims it, executes the same
orchestrator, and reports through the run row. The orchestration itself did not
move: `executeRun` already wrote the run before the first provider call, already
persisted each observation as it landed, and already had a uniqueness constraint
that made a retry fill gaps rather than duplicate. Those are exactly the
properties a queued retry needs, so reimplementing them alongside a lease would
have been the expensive mistake. What the orchestrator gained is one thing: a
checkpoint it can ask, placed between fan-outs, so a long run can renew a lease
and notice a cancellation without knowing what either is.

**The producer, not the handler, creates the run row.** So the customer sees a
`queued` run the moment they click, and so a job that no worker ever reaches
still leaves durable evidence that they asked. It costs one thing: a request
that loses the idempotency-key race by microseconds has already written a run
row, which is then deleted — guarded on the row being `queued` with no
observations, so it can never take a real run with it.

**Deduplication is two layers, because one would not do.** An active-job lookup
answers "is a run already happening for this project?", which is what a user
clicking twice thirty seconds apart actually means; a read cannot close the
millisecond window, so a per-intent idempotency key backs it with the database's
uniqueness constraint. Manual runs bucket by a coarse clock so a deliberate
re-run a minute later still works; scheduled runs bucket by the plan's period so
a cron retry maps to the same job. The sweep additionally holds a named lock,
which `lib/jobs/lock.ts` was written for and nothing had ever used.

**The response contract changed, and the frontend changed with it.** POST now
answers 202 with the identifiers and nothing else — no coverage, no observation
count, no cost, because none of them exist yet and a zero would be
indistinguishable from a run that measured nothing. GET on the same route
reports the job and the run separately, neither inferred from the other, and
computes whether polling should stop so that rule lives in one place. The run
button renders queued, running, retrying, completed, partial, failed and
cancelled as themselves rather than collapsing them into one spinner: a run
waiting for a worker and a run halfway through six engines are different facts
about the customer's money.

**Consequences.**

- A worker must be deployed for anything to run. Until one is, a queued run
  stays `queued`, which the dashboard states plainly. This is the one genuine
  regression against the previous design, and it is why `scheduled_runs` stays
  `beta`.
- Job kinds are an allowlist in code, not a string a producer can invent. An
  unrecognised kind goes straight to `dead` where an operator sees it.
- `plan.ts` and `billing.ts` lost their `server-only` marker. The worker
  re-checks entitlement at execution time — a subscription can lapse between the
  click and the run — and that marker throws outside a request. Nothing is
  actually lost: both modules import the Prisma client, so Next's bundler
  already fails loudly on any client import, which is the same reasoning already
  recorded on `measurement/run.ts` and `jobs/queue.ts`.
- A worker that stops for its own reasons leaves the run `running` rather than
  finalising it. The alternative reports a deploy as a finished measurement.

**Rejected.** Having the handler create the run row (the customer sees nothing
between clicking and a worker picking the job up, and a job that is never
claimed leaves no trace); refunding the attempt counter on a graceful shutdown
(a crash-looping deploy would hand the same job back forever, and a job that can
never exhaust its attempts is one no operator ever sees); retrying a run whose
observations all recorded as failures (resumption skips rows that exist
regardless of status, so the retry is a guaranteed no-op that burns an attempt);
a real queue — Redis, SQS (one table and a poll loop is the right amount of
machinery for this load, and the interface here is what gets reimplemented if
throughput ever justifies more).

---

## ADR-019 — Migration recovery is rehearsed with fixtures held outside the history

**Accepted, 2026-08-31.**

Phase 2 criterion 3 asks that restoration *and* rollback or forward-fix be
rehearsed. Restoration had been rehearsed since 2026-08-25 and runs in CI. The
recovery half existed only as prose in `operations-runbook.md`, and prose is not
a rehearsal: the value of a recovery procedure is entirely in whether it works
when someone follows it under pressure.

Rehearsing it needs a migration that genuinely fails. That creates a problem
with an obvious wrong answer: add the failing migration to `prisma/migrations/`
so the drill can apply it. That would ship an unreviewed schema change to every
environment — including production — in order to prove something about a
database nobody has. The migration would also have to *succeed* everywhere it
ran except in the drill, which is a contradiction.

**Decision, in three parts.**

*Forward-fix is the recovery strategy; restore is the escape hatch.* Not a
preference. `prisma migrate resolve --rolled-back` is valid only for a migration
Prisma recorded as **failed**; it errors on one that succeeded. Undoing a
successful migration therefore requires a hand-written down script plus a
hand-edit of `_prisma_migrations` — two unsupported operations that manufacture
exactly the drift `db:drift` exists to catch — and a down script cannot recover
data, since re-adding a dropped column yields a column of nulls. Restore is the
only remedy when a migration destroyed or transformed data, and that is the sole
case where it beats forward-fixing.

*Rehearsal migrations live in `supertool/scripts/rehearsal-migrations/`, never in
`prisma/migrations/`.* The drill copies the real history into a temporary
directory, appends the rehearsal migrations there, and points the Prisma CLI at
a schema file beside them. The product's history is read and never written.
`tests/migration-recovery-drill.test.ts` fails the build if a rehearsal fixture
ever appears under `prisma/migrations/`, and the drill refuses to run in that
state, because a guard that only exists in a test that needs a database is a
guard that will one day not run.

*The incident is a real product contradiction, not a contrivance.* The staged
migration asserts one measurement run per project per UTC day. Gate 1 requires
two runs on one day to remain two distinct runs, and the shared rehearsal
fixture contains exactly that — the same fixture the restore rehearsal uses to
prove run identity survives a dump. So the migration fails on the product's own
semantics, with a real `23505`, and it fails for a reason a reviewer would
recognise rather than one invented to make a test go red.

**Consequence.** The drill measures the failure rather than assuming it, and
that changed the documentation. On PostgreSQL, DDL is transactional and Prisma
sends a migration as one implicit transaction, so a failed migration leaves the
schema untouched and the *history* damaged: `_prisma_migrations` keeps a failed
row and every subsequent `migrate deploy` refuses with P3009. The runbook had
implied an operator should hunt for half-applied DDL. Usually there is none, and
the incident is a wedged pipeline.

**What this does not settle.** The drill runs against disposable PostgreSQL with
synthetic, production-*shaped* data. It says nothing about a hosted provider's
tooling, about lock duration or backfill time at production volume, about
migrations whose DDL cannot run in a transaction (`CREATE INDEX CONCURRENTLY`),
or about downtime. Those are listed in
`docs/evidence/2026-08-31-migration-recovery-drill.md` §6 and remain open Phase 2
work.

---

## How to add an ADR

Append. Never edit an accepted decision in place — supersede it with a new entry
and mark the old one `superseded`, keeping the original reasoning visible.

An ADR is warranted when a choice constrains future work, is expensive to
reverse, or will otherwise be re-litigated by whoever arrives next. A decision
that weakens a §3 invariant of the constitution requires an ADR and cannot be
made in passing.
