# Data provider strategy

Governed by `docs/product-constitution.md` §5.

Data quality is a product feature. This document defines how data enters Rank
Logic, what must be true before it does, and how the product stays free of any
single vendor's identity.

---

## 1. The contract-first rule

No provider is integrated directly into a feature. Every data family gets a
versioned internal contract first, and adapters implement that contract.

The repository already does this in one place — `src/lib/seo/providers/keyword-data.ts`
sits between the keyword feature and DataForSEO — and that is the pattern to
extend, not a special case.

For each data family, the following must exist before any adapter is written:

| Element | Why |
| --- | --- |
| Versioned internal contract | The product's types, not the vendor's. Vendor changes become adapter changes. |
| Normalization rules | Two providers' "difficulty" are not the same number. State the conversion or refuse to merge them. |
| Provenance fields | Provider, retrieval time, method, locale, device, and whether the value is measured, estimated or modelled. |
| Freshness SLA | How stale a value may be before the UI must say so. |
| Cost model | Unit cost per call and the expected call volume per project per month. |
| Legal constraints | Storage rights, redistribution rights, retention limits, attribution requirements. |
| Retry policy | What is retried, how often, and what is recorded as a permanent failure. |
| Test fixtures | Recorded real responses, secrets stripped, so the adapter is testable without spend. |

---

## 2. Data families

| Family | Preferred source | Current state | Phase |
| --- | --- | --- | --- |
| Query, page, click, impression, CTR, position | Google Search Console (first-party) | Not connected | 3 |
| Onsite behaviour and conversions | GA4 (first-party) | Not connected | 3 |
| Local profile, posts, reviews | Google Business Profile (first-party, where authorized) | Not connected | 7 |
| Content and publishing state | WordPress REST (first-party) | `beta`, stub-tested only | 3 |
| Crawl observations | Rank Logic's own crawler | `verified` — 25 rules | 4 for depth |
| Keyword volume, CPC | Licensed provider (DataForSEO adapter exists) | `beta`, never run live | 4 |
| Keyword difficulty | Modelled — always partly | `beta`, disclosed as modelled | 4 |
| SERP features and positions | Licensed provider | Absent | 4 |
| Rank tracking | Licensed provider | `unavailable` | 4 |
| Backlinks and referring domains | Licensed provider | `unavailable` | 4 |
| Answer-engine responses | Vendor APIs with documented grounding | `unavailable` — no engine passes the audit | 1 |

---

## 3. First-party before third-party

Where the customer's own data can answer a question, it wins. It is more
accurate, cheaper, legally simpler, and it cannot be contradicted by the
customer's own console.

Third-party data is for questions first-party data structurally cannot answer:
competitor performance, web-scale link graphs, and SERP composition for queries
the customer does not yet rank for.

---

## 4. Provider evaluation

A provider is a candidate, never an automatic approval. Before integration:

1. **Verify current official documentation.** Not a blog post, not a summary,
   not recollection. The vendor's own current docs, cited by URL and retrieval
   date. This is the exact check that failed for all five answer engines in Gate
   1, and it is why they are all unavailable.
2. **Confirm commercial terms** — price, rate limits, overage behaviour.
3. **Confirm storage and redistribution rights.** Can the data be stored? For
   how long? Can it be shown to the customer's client in a white-label report?
   Can it be exported? A provider that forbids redistribution cannot back a
   client-facing report.
4. **Measure coverage, freshness and accuracy** on a sample relevant to the
   target customer, not on the vendor's demo.
5. **Test reliability and latency** under the product's real call pattern.
6. **Model unit economics** at expected volume, per project and per organization.
7. **Record the evaluation** as an ADR in `docs/architecture-decision-log.md`,
   including the providers rejected and why.

---

## 5. Prohibited

- Scraping a protected service in violation of its terms.
- Relabelling an estimate as measured.
- Merging metrics with different definitions without disclosing it.
- Exposing one tenant's data to another.
- Letting a stale provider value appear current.
- Storing or redistributing data beyond contractual rights.
- Substituting one provider's product for another and presenting it as the
  original. A Gemini completion is not Google AI Mode; this rule generalizes.

---

## 6. Provenance is not optional

Every stored value carries where it came from. The Gate 1 `Observation` model is
the reference implementation: provider, model requested, model returned,
grounding requested, grounding confirmed, locale, region, sample index, status,
error category, latency, tokens, cost, parser version, methodology version.

New data families are expected to carry the analogous set. A value that cannot
say where it came from does not get stored.

---

## 7. Multi-provider posture

The product must survive losing any single vendor.

- Contracts are the product's own types.
- At least two candidate providers are evaluated per family before one is
  chosen, and the runner-up is recorded.
- Adapters are swappable without touching feature code.
- Provider identity is never in a customer-facing metric name. The customer sees
  "volume, from DataForSEO"; the feature is "keyword volume", not "DataForSEO
  volume".

---

## 8. Cost governance

Provider spend is a recurring operating cost tied to customer usage, and it is
the fastest way for a SaaS with generous limits to become unprofitable quietly.

- Every provider call records estimated cost at the observation level. This
  exists already in `src/lib/measurement/pricing.ts`, where every price entry is
  marked unverified and `estimateCostUsd()` returning 0 means "not estimated"
  rather than "free".
- Cost per organization must be observable before any paid provider is
  integrated (Phase 7 acceptance criterion).
- Budgets and rate ceilings are enforced per organization, not globally.
- Bring-your-own-key is `planned` for Phase 2 so cost can be pushed to the
  customer where they prefer it.

---

## 9. Legal review gate

The following require the product owner and cannot be resolved in code:

- Accepting any provider's terms of service.
- Any commitment to recurring spend.
- Redistribution of provider data into white-label client reports.
- Retention of provider data beyond a contractual limit.
- Storage of answer-engine response text, which may carry third-party content.

Phase 1 and Phase 4 both list legal review as an external blocker for this
reason.
