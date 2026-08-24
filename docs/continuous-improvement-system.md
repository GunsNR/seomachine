# Continuous improvement system

Governed by `docs/product-constitution.md` §6. Operationalized by Phase 9; this
document defines the machine, not its current state.

---

## 1. What "self-improving" means here

A controlled, observable, reversible product-learning loop:

**Observe → benchmark → propose → evaluate → approve → canary → measure → keep
or roll back → document.**

It does not mean an AI rewriting or deploying production code on its own. That
boundary is constitutional and permanent, and it is stated as a permanent
out-of-scope item in `docs/current-and-target-capability-map.md` §4.

The distinction is not squeamishness. An autonomous deployer optimizes whatever
it can measure, and the things easiest to measure in this product — a score, an
engagement number — are precisely the things Gate 0 was written to stop the
product from optimizing at the expense of truth.

---

## 2. Technology radar

Monitors official vendor documentation, release notes, model deprecations, API
changes, security advisories, search-engine documentation, WordPress and
Elementor changes, browser changes, and relevant standards.

Every entry records: source URL, retrieval date, affected capability, confidence,
owner, required action.

Rules:

- Official first-party sources only for provider implementation decisions. This
  is not a preference. Gate 1 marked five answer engines unavailable specifically
  because their documentation could not be reached, and deliberately did not
  substitute third-party summaries or model recollection.
- The radar opens issues or draft pull requests. It never deploys.
- A deprecation notice affecting a `verified` or `beta` capability is a P1: the
  capability's registry row must be re-checked within the same week.

---

## 3. Provider and model registry

Versions every model, search tool, endpoint, capability, cost, limit and known
restriction.

The existing implementation is `src/lib/ai/engines.ts`, and its important
property should be preserved as this expands: **availability is derived, not
declared.** An engine is available only if it has an official API, enables the
vendor's retrieval tool, and has its model confirmed against first-party
documentation. Nobody can hand-set an engine to available; they have to change a
fact about it.

Additions Phase 1 owes this registry:

- Deprecation and behaviour-change alerts.
- Contract tests against recorded real responses.
- Live canaries with controlled budgets.
- A documentation-verification record per engine: URL, retrieval date, and the
  specific claim verified.

Never call an unverified completion endpoint "grounded search".

---

## 4. Evaluation harness

Golden datasets and representative workflows for classic SEO, AI visibility,
content, technical analysis, local SEO, reports and publishing.

Tests accuracy, citation quality, unsupported claims, consistency, latency, cost,
user comprehension and safety.

- Proposed provider or model changes run in shadow mode before release.
- Historical results are preserved so regressions are visible rather than
  rediscovered.
- An evaluation that only measures whether output looks good measures nothing.
  Each dataset needs a known-correct answer or a documented rubric.

---

## 5. Product analytics

Privacy-respecting event data for onboarding completion, time to first value,
feature adoption, task completion, approval, publish success, errors, retention
and support friction.

- No dark patterns. No unnecessary sensitive data.
- In-product feedback at the point of recommendation and at the point of
  outcome — the two moments where the user knows something the product does not.
- Regular usability tests with agency operators, specialists, business owners and
  clients.

---

## 6. Outcome learning

Links recommendation → approval → implementation → verification → later
measurement.

The point is to learn which actions correlate with positive results, by context.
The discipline is to keep saying "correlate":

- Correlation and causation stay separated in the data model and in the copy.
- Holdouts or controlled experiments where practical.
- Never optimize solely for an internal score. `geo_scoring` is a nine-signal
  heuristic with hand-chosen weights and no held-out dataset; it is labelled that
  way in the registry, and optimizing the product to raise it would be optimizing
  a number nobody has shown predicts anything.

---

## 7. Competitive radar

Re-audits named and emerging competitors on a schedule. Tracks workflow changes,
verified features, pricing, integrations, positioning and customer objections.

Findings become hypotheses, scored by customer value, strategic fit, evidence,
effort, risk and operating cost. Method and evidence rules are in
`docs/competitive-scorecard.md`.

Do not chase every competitor release. A feature shipped by a competitor is
evidence about their strategy, not about this product's customers.

---

## 8. Change governance

AI may draft specifications, tests, migrations, code, documentation and pull
requests.

Mandatory regardless of who or what wrote the change:

- CI green, including the truth and capability checks.
- Security review for anything touching auth, tenancy, secrets or network egress.
- Evaluation gates for provider or model changes.
- Human review and explicit approval to merge.
- Feature flags for incomplete or risky work.
- A rollback plan.

Never autonomous: production deployment, secret creation, external purchase,
legal acceptance, destructive migration, customer communication, pricing change,
marketing claim.

Every accepted change updates architecture decisions, capability evidence, tests,
documentation and release notes.

---

## 9. How drift is actually detected today

Phase 9 is far away. These checks run now, on every CI run:

| Check | Guards against |
| --- | --- |
| `tests/capabilities.test.ts` | Registry and truth audit disagreeing; a non-sellable capability entering a pricing table |
| `tests/marketing-truth.test.ts` | Fabricated proof; a withdrawn capability being re-sold |
| `tests/provider-audit.test.ts` | An engine being marked available without grounding and verified documentation |
| `tests/provenance.test.ts` | A live failure being replaced with simulated output; secrets reaching storage or display |
| `tests/constitution.test.ts` | A roadmap entry upgrading a public claim; an evidence field citing a file that no longer exists; planning documents acquiring the present tense |

The last one is the Phase 0 addition. The others predate it and are the reason
Phase 0 could be written against a product whose real state was knowable.
