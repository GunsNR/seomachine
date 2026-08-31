# Measurement specification — Rank Logic SuperTool

**Methodology version:** `m1` (introduced in Gate 1)
**Parser version:** `p1`
**Status:** normative. Code that reports a number must implement this document, and
`supertool/tests/measurement-*.test.ts` enforces the parts that can be enforced.

This document defines what SuperTool measures and, more importantly, what it
refuses to claim. Gate 0 established that a number must carry its provenance.
Gate 1 establishes what the number *means*.

---

## 1. Vocabulary

These words have exactly one meaning in this codebase. Where the UI uses a
different word for a lay audience, the mapping is stated here.

### Run (`MeasurementRun`)

One execution of one prompt set against one project, identified by a **unique
run ID**. A run has a start time, an end time, a trigger (`manual`,
`scheduled`, `backfill`), a data mode (`live`, `demo`), a prompt-set version, a
methodology version, a sampling configuration and a terminal status.

A run is the atomic unit of reporting. Every rate SuperTool displays is computed
**within a single run** unless the surface explicitly says it is aggregating
across runs.

### Observation (`Observation`)

One attempt to ask one prompt, on one engine, at one sample index, within one
run. Exactly one row exists per `(runId, promptId, engine, sampleIndex)` — that
tuple is a uniqueness constraint, which is what makes retrying a run idempotent.

An observation is immutable. Nothing in the product updates an observation after
it is written. A correction is a new run, not an edit.

Every observation carries one of four statuses:

| Status | Meaning | Counts as attempted | Counts as observed |
| --- | --- | --- | --- |
| `live` | A real provider call returned an answer. | yes | **yes** |
| `simulated` | Deterministic sample text from a demo workspace. | yes | **yes**, but only inside a demo workspace |
| `failed` | A real provider call was attempted and did not succeed. | yes | no |
| `unavailable` | No call was attempted — no compliant source, or no credential. | yes | no |

### Sample and sample index

A **sample** is one repetition of the same `(prompt, engine)` pair inside one
run. `samplesPerPair` is configurable per run. `sampleIndex` is 0-based.

Repeated sampling exists because answer engines are non-deterministic: asking
the same question twice can produce different vendor lists. One sample is an
anecdote. The sample index is stored so that repeats are distinguishable and so
that a retry cannot double-count.

### Prompt set and prompt-set version

The **prompt set** is the fixed list of questions a project is measured against.
The **prompt-set version** is a content hash of the prompt texts in that set at
the moment the run started.

Every observation additionally stores an immutable **snapshot of the prompt
text** it actually asked. Prompts can be edited or deleted; the record of what
was asked cannot change retroactively. Comparing two runs with different
prompt-set versions compares two different instruments, and the UI must say so.

### Inclusion (UI: "mentioned")

The brand name appears in the prose of an observed answer, matched as a whole
word, with URLs stripped before matching. A brand's own domain appearing inside
a source URL is a **citation**, not a second inclusion.

### Citation (UI: "cited")

The brand's own registrable domain appears among the source URLs the engine
returned, either in provider-supplied citation metadata or parsed out of the
answer text. Citation is strictly stricter than inclusion: a citation without an
inclusion is possible and is recorded as such.

### Coverage

`coverage = observed / attempted`, per run.

Coverage is not a quality metric and not a score. It states how much of the run
actually produced data. It is displayed next to every rate, always, including
when it is 1.0.

### Failure

Any observation with status `failed`. A failure is a gap in the instrument, not
evidence about the brand.

---

## 2. Numerators and denominators

This is the section that matters most. Every reported metric is defined here
exactly, and no other definition is permitted anywhere in the code.

Let, within a single run:

- `A` = observations attempted (all four statuses)
- `O` = observations **observed** (status `live`, or `simulated` in a demo workspace)
- `M` = observed observations where `brandMentioned` is true
- `C` = observed observations where `brandCited` is true

| Metric | Numerator | Denominator | Notes |
| --- | --- | --- | --- |
| **Coverage** | `O` | `A` | Always shown. |
| **Inclusion rate** | `M` | `O` | Never `A`. |
| **Citation rate** | `C` | `O` | Never `A`. |
| **Share of voice** | sum of per-observation brand share | `O` | Mean over observed rows only. |
| **Mean mention rank** | sum of `mentionRank` | `M` | Rank is undefined when absent, so the denominator is inclusions, not observations. |
| **Per-engine inclusion rate** | `M` restricted to that engine | `O` restricted to that engine | `null` when that engine's `O` is 0. |

**The governing rule:** a `failed` or `unavailable` observation appears in the
denominator of **coverage only**. It never enters the numerator or the
denominator of any rate.

The reason is that the alternative is a lie. If five of six engines are
unreachable and the sixth does not name the brand, dividing by attempts yields
"17% inclusion" — a number that describes an outage and reads as a finding. The
correct statement is "1 of 6 observed; inclusion 0/1; insufficient evidence."

### Demo workspaces

`simulated` observations count as observed **only** inside a workspace whose
`dataMode` is `demo`, and every surface fed by them is labelled as sample data.
A live workspace can never contain a simulated observation; the provider layer
makes the two paths mutually exclusive.

---

## 3. Provenance rules

Every observation records, at minimum:

| Field | Why |
| --- | --- |
| `runId` | Groups the observation. Never a date. |
| `promptId` + `promptTextSnapshot` + `promptVersion` | What was actually asked, immune to later edits. |
| `engine`, `vendor`, `accessMethod` | Which surface, reached how. |
| `modelRequested` | The model identifier SuperTool sent. |
| `modelReturned` | The model identifier the provider said it used, when the provider returns one. Empty when it does not — never inferred. |
| `groundingRequested` | Whether the request enabled the vendor's web-retrieval tool. |
| `groundingConfirmed` | Whether the response actually carried retrieval evidence. |
| `sampleIndex` | Which repetition. |
| `localeTag`, `regionCode` | The locale context the run declared. |
| `status`, `errorCategory`, `errorDetail` | Provenance and honest failure reporting; credentials are redacted before storage. |
| `latencyMs`, `inputTokens`, `outputTokens`, `estimatedCostUsd` | Cost and performance accounting. |
| `citedUrls`, `evidenceExcerpt`, `rawAnswerHash` | Evidence, so a number can be traced to the text that produced it. |
| `parserVersion`, `methodologyVersion` | Which rules produced the parsed outcome. |

### Locale honesty

`localeTag` and `regionCode` record **what the run declared**, not what the
provider honoured. No current adapter can prove a provider served a given
locale. The UI therefore describes these as the requested context, and the
capability registry does not claim locale-specific measurement.

### Model honesty

`modelRequested` is always known. `modelReturned` is recorded only when the
provider returns it. The two are displayed separately and are never merged,
because a provider silently substituting a model is exactly the kind of drift
this schema exists to catch.

### Grounding honesty

`groundingRequested` is a property of the request SuperTool made and is known
with certainty from the code. `groundingConfirmed` requires retrieval evidence
in the response. An engine that does not request grounding is **not measuring
AI search** — it is measuring a model's parametric recall — and must not be sold
as the former. See §7.

---

## 4. Minimum evidence

`MIN_OBSERVATIONS_FOR_RATE = 5` observed observations for a given cut of the
data.

Below that threshold, SuperTool displays **"insufficient evidence"** and the
observed counts. It does not display a percentage. A rate computed from one or
two samples is noise wearing the costume of a measurement, and a customer
cannot be expected to know that.

The threshold is a documented product judgement, not a statistical derivation.
It is deliberately low enough to be reachable and high enough that the interval
around the rate is visibly wide rather than invisibly wrong.

---

## 5. Confidence

For a binary rate `p̂ = k/n`, SuperTool reports a **95% Wilson score interval**.

```
centre = (k + z²/2) / (n + z²)
half   = z/(n + z²) · √( k(n−k)/n + z²/4 )
CI     = [centre − half, centre + half]      z = 1.96
```

### Why Wilson

The normal approximation (`p̂ ± z√(p̂(1−p̂)/n)`) is degenerate at the boundaries:
at `k = 0` it produces the interval `[0, 0]`, asserting certainty from evidence
that contains none. Wilson stays inside `[0, 1]`, remains sensible at `k = 0`
and `k = n`, and behaves acceptably at the small sample sizes this product
actually operates at.

### Assumptions, stated plainly

The Wilson interval assumes the `n` observations are **independent Bernoulli
trials**. SuperTool's samples are *not* fully independent:

- Samples within one run are drawn close together in time, against the same
  index state, often with the same prompt wording.
- Samples across engines share the prompt, so prompt wording is a common cause.

The interval is therefore best read as a **lower bound on uncertainty**: the
true uncertainty is at least this wide, and probably wider. The UI labels it
"95% interval (assumes independent samples)" rather than implying a guarantee.

This is why run-to-run variation is reported separately rather than folded in.

### Run-to-run variation

When **two or more completed runs** share a prompt-set version, SuperTool
reports the observed spread of the run-level rates — minimum, maximum and
standard deviation across runs — as a separate figure.

This is an empirical dispersion, not a modelled one, and it captures the
between-run variance that the within-run interval cannot. With fewer than two
comparable runs it is not reported at all.

### False precision

Rates are displayed to whole percentage points. Intervals are displayed to whole
percentage points. Costs are displayed to the cent. No metric derived from fewer
than `MIN_OBSERVATIONS_FOR_RATE` observations is displayed as a number.

---

## 6. Run lifecycle and partial runs

```
queued ──▶ running ──┬──▶ completed    all attempted, at least one observed
                     ├──▶ partial      finished, but coverage < 1
                     ├──▶ failed       finished with zero observations
                     └──▶ cancelled    stopped deliberately
```

`queued` is now a real waiting state rather than a moment. Both producers — the
dashboard's run button and the scheduled sweep — write the run row and enqueue a
`measurement.run` job; a worker executes it. The run therefore sits in `queued`
until a worker claims it, which is what the dashboard reports, and a run that no
worker ever reaches stays `queued` rather than pretending to progress.

- The run row is written **before** the first provider call.
- Each observation is written **as it completes**, not batched at the end.
- Therefore an interrupted process leaves a run stuck in `running` with a
  truthful subset of observations already durable. It is never silently lost and
  never silently completed.
- A run left in `running` past a staleness window is reported as **interrupted**
  in the UI. It is not auto-promoted to `completed`.
- Re-running a run is idempotent: the `(runId, promptId, engine, sampleIndex)`
  uniqueness constraint means a retry fills only the gaps and cannot duplicate
  an observation that already succeeded. This is what makes a queued retry safe
  after a worker dies mid-run.
- A run is checkpointed between fan-outs — the last moment before new provider
  spend and the first after a batch of observations became durable. Cancellation
  is honoured there, and only there, so nothing already written is torn up.
- A worker stopping for its own reasons — a deploy, a lost lease — leaves the run
  in `running` deliberately. A terminal status would report a deploy as a
  finished measurement. When the queue finally gives up on the job, the run is
  finalised from what actually landed, so it becomes `partial` or `failed`
  rather than sitting in `running` until the staleness window relabels it.

A `partial` run is a first-class result, not an error. It reports what it saw,
with coverage stated.

---

## 7. Why two runs on the same UTC date must remain separate

Before Gate 1, the dashboard grouped observations by `runAt.toISOString().slice(0, 10)`
— the UTC date. Every run on the same calendar day was merged into one bucket.

That is wrong in four distinct ways, and each one alone is disqualifying:

1. **It fabricates a run that never happened.** A 09:00 run of 24 prompts and a
   17:00 re-run of 6 prompts became a single 30-observation "run" whose rate
   corresponds to no actual measurement event.

2. **It destroys before/after comparison.** The core workflow is: measure,
   change a page, re-measure. If both measurements land on the same UTC day,
   date-grouping averages the before and after into one number and the change
   becomes invisible — precisely when the customer most needs to see it.

3. **It silently reweights the data.** Merging a 24-prompt run with a 6-prompt
   run weights the larger run 4:1, so the "daily" rate is dominated by whichever
   run happened to be bigger. Nothing in the UI disclosed this.

4. **It is timezone-dependent.** Two runs 30 minutes apart merge or split
   depending only on whether they straddle UTC midnight. A customer in UTC+13
   sees their working day split across two buckets.

Runs are therefore grouped by **run ID and only by run ID**, everywhere. A run
ID is generated once, at run creation, and never derived from a timestamp.

Trend charts plot one point per run, labelled with the run's start time, not one
point per day.

---

## 8. Known limitations

Stated here so they are not discovered as surprises.

- **No adapter has ever been executed against a live provider from this
  project.** Every rule above is implemented and unit-tested; none is externally
  validated. The capability registry reflects this.
- **Grounded retrieval is not currently enabled on any adapter** (see the
  provider audit in `docs/release-truth-audit.md`). Until it is, the product
  cannot claim to measure AI *search* visibility.
- **`estimatedCostUsd` is an estimate** derived from a local price table that
  is not fetched from any provider billing API. It is labelled as an estimate
  and must never be reconciled against an invoice.
- **Token counts come from the provider response when present and are `0`
  otherwise.** Zero means "not reported", not "no tokens used". Aggregates state
  how many observations reported usage.
- **Sampling is sequential within a run**, so a long run spans a time window
  during which the underlying index can change. The run start and end times are
  both recorded so this window is visible.
- **There is no independent panel.** The discovery prompts that generate a
  prompt set and the fixed panel that measures it are not yet separated, so
  prompt drift is possible between prompt-set versions. The prompt-set version
  makes drift detectable but does not prevent it.
- **The blended visibility score remains a modelled, experimental index** with
  hand-chosen weights that have never been validated against any outcome. It is
  labelled as such and is not a primary metric. Primary metrics are inclusion
  rate, citation rate, coverage, sample size, interval, engine and timestamp.
- **A retry cannot heal a failed observation.** Resumption skips every
  `(promptId, engine, sampleIndex)` that already has a row, whatever that row's
  status. A provider that was unreachable therefore stays recorded as `failed`
  for that run; re-running the job would skip it rather than re-ask it. This is
  the deliberate cost of the uniqueness constraint that makes retries safe: the
  alternative — overwriting an observation on retry — would make a run's
  contents depend on how many times it was attempted. A new run is the way to
  re-measure, and the coverage figure states what the previous one missed.
- **SQLite with `prisma db push` and no migration history.** Gate 2 owns the
  first reviewed Postgres migration. Nothing here should be deployed until then.

---

## 9. Change control

Changing any definition in this document requires incrementing
`METHODOLOGY_VERSION`. Observations record the methodology version that produced
them, so a definition change never retroactively reinterprets old data — it
makes old and new data explicitly non-comparable, which the UI must surface.
