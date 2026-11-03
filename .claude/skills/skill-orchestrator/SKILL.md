---
name: skill-orchestrator
description: Use at the start of any non-trivial task (build, design, SEO, research, clone, video, launch, debug) to pick the best ordered group of installed skills, run them in sequence, and avoid overlapping ones.
---

# Skill Orchestrator

One router for every installed skill. Its job: choose the smallest ordered **group** of skills that does the task well, run them in order, and hand each one's output to the next. It does not do the domain work itself.

Invoke skills by name (`/name` in Claude Code, `$name` in Codex). Plugin skills may be namespaced (for example `claude-seo:seo-audit`).

## Procedure

1. **Classify the task** into one or two types from the routing table below. If it is a single obvious skill ("write a logo brief"), just run that skill and skip the rest of this procedure.
2. **Check what is installed.** Look at the skill list in front of you. Use only skills you can see. If a named skill is missing, use the fallback in the same row, or say in one line what is missing and continue with the next-best option. Never invent a skill name.
3. **Announce the group in one line**, for example: `Stack: ui-ux-pro-max -> impeccable -> verification-before-completion.` Then start. Do not ask permission to use a skill.
4. **Run in order.** Give each skill the previous skill's output (file path or summary). Save outputs as files in the project, not only in chat.
5. **Gate on risk.** Stop and ask before anything that spends money, sends or publishes something, installs software, uses a login or API key, deletes data, or touches client or patient information.
6. **Close with proof.** Before saying a task is done, run `verification-before-completion` if installed (run the thing, look at the result), and report what was and was not verified.

## Routing table

| Task | Group, in order | Notes and fallback |
|---|---|---|
| **Plan or build any feature** | `brainstorming` -> `writing-plans` -> `test-driven-development` -> `verification-before-completion` -> `requesting-code-review` | Process skills from superpowers. If `using-superpowers` is installed, follow it for these. |
| **Bug, failing test, odd behavior** | `systematic-debugging` -> `test-driven-development` -> `verification-before-completion` | Fallback: `engineering:debug`. |
| **Website or app UI (new or redesign)** | `ui-ux-pro-max` (style, palette, fonts) -> `impeccable` (build and critique) -> `animated-site-stack` (motion) -> `verification-before-completion` | One design brain per task: do not also run `design`, `design-system` and `ui-styling` unless the task is tokens or a Tailwind/shadcn build. |
| **Scroll-driven or cinematic landing page** | `scroll-craft` -> `impeccable` (polish) -> `page-cro` | Use `scroll-craft` for full scroll experiences; `animated-site-stack` for lighter polish. |
| **Hero section** | `perfect-hero-page-builder` -> `hero-ui-prototype-builder` -> `hero-cro-auditor` | These are `anthropic-skills:*`. Fallback: `copywriting` + `impeccable`. |
| **Conversion fix on an existing page** | `page-cro` -> `copywriting` -> `ab-test-setup` (+ `form-cro` or `popup-cro` for that element) | Measure before and after; never invent conversion numbers. |
| **Logo or brand identity** | `logo-design` -> `brand` (voice, guidelines) -> `banner-design` (assets, if asked) | Use `design` only for identity programs or mockups. Check any new name for trademarks. |
| **SEO audit of a site** | `claude-seo:seo` (`/seo audit`) -> `seo-audit` -> `schema-markup` (if schema gaps) | For paid or local focus add `claude-seo:seo-local`. Fallback: `seo-audit`. Prefer Ahrefs data over Semrush when a connector is available. |
| **SEO and CRO combined, with SERP and hero rebuild** | `seo-cro-orchestrator` | It is itself an orchestrator; call it instead of rebuilding its chain. |
| **Write or update SEO content** | `/research` -> `/write` -> `/optimize` (seomachine commands) or `content-strategy` -> `copywriting` -> `copy-editing` | Fallback outside seomachine: `searchfit-seo:*` or `claude-seo:seo-content`. |
| **Programmatic or location pages** | `programmatic-seo` -> `schema-markup` -> `seo-audit` | |
| **Social posts and creative** | `content-style-synthesizer` -> `social-creative-designer` or `social-content` -> `repurpose` | |
| **Research a topic or competitor** | `last30days` (recent community signal) -> `deep-research` (long report) | For competitor pages: `competitor-alternatives`. |
| **Turn a video into something** | `video-to-skill` (transcript, then skill or plan) -> `skill-creator` / `writing-skills` (polish) | To analyze a video's hooks or moments: `watch-video`. To copy a video's style: `video-style-recreator`. |
| **Build a skill from examples** | `reverse-engineer-output` -> `skill-creator` / `writing-skills` -> test on one real case | |
| **Clone or rebuild one feature of an app** | `rea-feature-rebuild` -> `reverse-engineer-anything` (inspect the shipped app) -> `brainstorming` -> `test-driven-development` | Rebuild behavior only; never copy code, assets or copy. Check terms of service. |
| **Clone a whole product to launch** | `replica-recon` -> `replica-architect` -> `replica-design` -> `replica-build` -> `replica-backend` -> `replica-test` -> `replica-diff` -> `replica-entrepreneur` -> `replica-brand` -> `replica-launch` -> `replica-deploy` | Run one step at a time; each reads the `replica/` folder the last one wrote. |
| **Is this app ready to sell? pricing, paywall** | `commercial-app-advisor` -> `pricing-strategy` -> `paywall-upgrade-cro` -> `launch-strategy` | Add `replica-entrepreneur` to mine competitor reviews. Label every price as an estimate until checked live. |
| **Launch or announce** | `launch-strategy` -> `email-sequence` -> `social-content` | |
| **Tracking and reporting** | `analytics-tracking` -> `ab-test-setup` | Show ROI proof (tracking, attribution) before vanity metrics. |
| **Setup is slow, noisy or bloated** | `ai-setup-audit` | Read-only first; edits only with a yes. |

## Overlap rules

- **One brain per job.** When two skills do the same job, run the more specific one (domain beats generic, plugin-namespaced beats copied folder) and skip the rest.
- **Cap the group at 5 skills.** Each installed skill costs context. If the task needs more, split it into two passes and save a file between them.
- **Process before domain.** Planning, TDD and verification wrap a domain skill; they do not replace it.
- **Do not chain a skill after itself** or run an orchestrator inside an orchestrator. `seo-cro-orchestrator` and this skill both route; pick one.
- If two skills disagree, follow the one closer to the task and say which you followed.

## Output format

When asked for a plan or recommendation, use: Decision / Recommendation; Why (3 bullets); Next 1-3 tasks with Definition of Done; Risks and mitigations. For a task you are executing, announce the group, then do the work.

## Common mistakes

- Running every skill that vaguely matches. Choose a group, not a pile.
- Asking the user to pick skills. Pick, announce, proceed.
- Naming a skill that is not installed.
- Skipping the closing proof step.
- Letting an orchestrator hide a risky action: the gates in step 5 always apply.

Last verified: 2026-11-03 against the skills installed that day. When a new skill or stack is installed, add its row here.

## Open questions

- Which skills should be treated as defaults for a new client site (design, SEO, tracking)?
