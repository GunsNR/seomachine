# Skill plan

Recorded 2026-11-03. Lists the skills actually applied, the artifact or check each one produced, and what was considered but not used.

## Inventory scope

| Source | SKILL.md files scanned (front matter only) |
| --- | --- |
| Installed plugins (`~/.claude/plugins/synced`) | 646 |
| User-synced skills (`~/.claude/skills/synced`, incl. RankLogic custom) | 46 |
| Project skills (`seomachine/.claude`, `Izzy-s-Full-Marketing-Kit/skills`) | 37 |
| Bundled `/mnt/skills` (examples + public) | 43 |
| **Total** | **846 files, 746 unique names** |

Method: names and descriptions were extracted from every SKILL.md. Full bodies were read only for the strongest candidates (marked "read" below).

**Not accessible this session:**
- About 95 MCP servers failed to connect (proxy 403 or timeout). Among them: GitHub plugin, Exa, Klaviyo, Similarweb, Supermetrics, Adspirer, Agency MCP.
- Datadog needs authorization.
- Their skills may be listed, but their tools could not be used.

**Named in the brief but not installed:**
- `engineering-suite-research:research`
- `gunsnr-codex-skills:reverse-engineer-anything`
- `gunsnr-codex-skills:replica-backend`
- `mattpocock-skills:code-review`
- `design-taste-frontend`
- `ui-ux-pro-max`
- `impeccable`
- `ui-styling`

## Selection by phase

| Phase | Candidates considered | Selected | Why | Output / evidence |
| --- | --- | --- | --- | --- |
| Product / architecture | `engineering:architecture`, `10x-Team:principal-architect`, `zizi-skills:service-architecture`, `10x-Team:cto` | None loaded. Decision written directly against the product constitution. | The repo's own governance (`docs/product-constitution.md`) was the stronger constraint than a generic ADR template. | `replica/architecture.md` |
| Vendor research | `deep-research`, `nimble:*`, `brightdata-plugin:live-research` | General-purpose research subagent, restricted to official docs | Independent work that could run in parallel. The brief explicitly allows delegating it. | `replica/research/vendor-capabilities.md` (20 rows, Verified/Unverified labels) |
| Brand / visual direction | `frontend-design` (read), `design-skills:design-systems`, `design:design-system`, `design-superpowers:design`, `anthropic-skills:brand-guidelines` | **frontend-design** | Its two-pass plan → anti-default review → build process fits a new interface. It explicitly flags the warm-clay/near-black defaults, which sit close to the approved palette. | `replica/design.md` §3–4. A KPI-tile layout was removed after the anti-default review. |
| Frontend | `zizi-skills:frontend` (read), `21st:21st-ui`, `zizi-skills:tabler-ui` | **zizi-skills:frontend** (applied its verification rules; the Vue/Tabler specifics don't apply) | Its "built output with dynamic class names" gate caught a real defect. | A purged `btn-danger` class was found in the browser and fixed (`design-review.md` R2) |
| Design review | `design-superpowers:design-review` (read), `design-skills:design-critique`, `design:design-critique` | **design-superpowers:design-review** | Its chain fits screenshots: visual quality → UX → a11y, with a P0–P3 rubric and a required "what's working" section. | `replica/design-review.md` |
| Accessibility | `design-skills:accessibility-audit`, `design:accessibility-review` | Neither loaded. WCAG 2.2 AA checks were scripted directly. | A repeatable in-browser probe across 15+ screens was more useful than a one-off checklist. | `scripts/a11y-probe.cjs`, contrast table in `design.md` §4 |
| Landing / hero CRO (RankLogic custom) | `anthropic-skills:hero-cro-auditor`, `perfect-hero-page-builder`, `seo-cro-orchestrator`, `hero-ui-prototype-builder` | **hero-cro-auditor**, from its description only | It is the closest RankLogic match for the builder's hero. Its binary-eval idea became in-product checks. The full body was not loaded, so this is an adaptation, not the skill's workflow. | `heroChecks()` in `src/lib/site/sections.ts` and the "Conversion checks" panel |
| Social / content (RankLogic custom) | `social-creative-designer`, `content-style-synthesizer` | Considered, **not used** | Both generate copy. The MVP ships deterministic templates from approved facts only. Real copy generation waits on AI approval. | — |
| SEO | `searchfit-seo:technical-seo`, `seo-audit:technical-seo-code-audit`, `seo-aeo-geo-ultimate:seo-technical` | None loaded. Rules were written against Google's documented signals. | The crawler rules are small and deterministic. | `src/lib/seo/rules.ts`, tests |
| AI integration | `claude-api` (read) | **claude-api** | Required whenever Claude code is written. | Model IDs and prices from the skill table (cached 2026-10-06); official SDK pinned at a version at least 2 weeks old. One deviation is recorded in `backend.md` (no `fallbacks` parameter while AI is off). |
| Security | `zizi-skills:security-and-hardening` (read), `security-review`, `10x-Team:security-engineer` | **zizi-skills:security-and-hardening** | It covers credential reach, SSRF/TOCTOU and trust boundaries specific to this build. | The DNS lookup is pinned inside the socket (`src/lib/net.ts`); a secret-redaction test; threat boundaries in `backend.md` |
| Testing | `superpowers:test-driven-development`, `zizi-skills:tdd-skill`, `10x-Team:qa-engineer` | None loaded. Behaviour tests were written against the acceptance scenarios. | The scenarios in the brief are already a test plan. | 69 Vitest tests and 20 browser journey checks |
| Code review | `code-review` (built-in, run), `engineering:code-review`, `superpowers:requesting-code-review` | **code-review** at high effort over `211fc45..HEAD` | It is the built-in reviewer, and its findings can be tracked. | 10 findings, all fixed, each with a regression test (commit `37842c1`) |
| Reference-product observation (REA) | `reverse-engineering:reverse-engineering` | **Not used** | No authorized session for HighLevel or ContentStudio was available. The brief forbids inferring backend architecture from behaviour. | Vendor docs were used instead (see research) |

## Conflicts resolved

- **frontend-design vs the approved palette.** The skill warns that a warm-clay accent reads as a generated-design "tell". The brief and ADR-012 fix Raw Sienna as the brand colour, and the brief's own words win. Mitigation: Sienna is used sparingly (one action per view, overdue state) on a cool Tasman canvas, not a cream one.
- **claude-api default model vs the brief's "least expensive model that passes evals".** The skill says to default to `claude-opus-5-5` unless the user names a model. The brief asks for the cheapest model that passes an eval, but running evals costs money, which needs approval. Resolution: the model is configurable through `AI_MODEL`, with the skill's default. Moving to `claude-haiku-5-5` is gated on an approved 20-draft evaluation.

## Reassessment log

- **After M0.5:** design skills held up. The frontend skill's purge rule found a defect, so it stays in use.
- **After code review:** no change to the selection. All findings were fixed in place.
