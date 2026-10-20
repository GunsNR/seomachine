---
name: rea-feature-rebuild
description: Use when you want to rebuild one specific feature of an existing app or site in your own project, using the REA skill to study how it works first.
---

# REA Feature Rebuild (5-step workflow)

Source: YouTube video "Reverse Engineer Anything" (creator name not stated in the transcript; UNCLEAR). The video describes a 5-step way to use the REA repo (github.com/morluto/rea). This skill is the workflow; `reverse-engineer-anything` is the tool skill it calls.

## Purpose and triggers
Rebuild the *functionality* of a feature you like (for example a screen-recorder bubble, an eval dashboard, a landing-page animation) in your own project. Not for cloning a whole product, its UI, code or assets.

## Inputs checklist
- [ ] One named feature, and the app it comes from
- [ ] A target you legally have: an app installed locally, a public web page, your own capture (HAR), or a file you own
- [ ] The project to rebuild it in, on a clean git branch
- [ ] What "works" means: 3-5 test cases

## Procedure
1. **Pick a feature, not an app.** Write one sentence: "Rebuild how [app]'s [feature] does [behavior]." Reason: "reverse engineer Loom" is too broad and gives vague results. Done when the scope is one behavior with test cases.
2. **Route by build.** Find out what the target is built with (web page, Electron/JavaScript app, native binary, Android APK). Then use the matching route in the `reverse-engineer-anything` skill. Reason: each kind of target needs different tools. Done when the route is chosen.
3. **Summary first.** Run the analysis once and work from its summary. Drill into modules only for questions the summary left open. Save the results locally and reuse them. Do not re-run the full analysis. Reason: full analyses can be very large. Done when a short findings summary exists in the project.
4. **Tag every finding as Seen, Inferred or Unknown.**
   - Seen: found and cited (Evidence ID).
   - Inferred: the evidence points to it, but it is a guess.
   - Unknown: could not be observed.
   Reason: building on guesses as if they were facts causes the worst bugs. Done when every finding carries a tag, and every Inferred item has a test that checks it.
5. **Rebuild and test.** Build your own version with your own code and design. Run the test cases, compare behavior, and iterate until they pass. Reason: "it looks done" is not done. Done when all test cases pass and the results are recorded.

## Decision rules
- Request names a whole app: ask which 1-3 features matter, then run one feature per pass.
- REA tools are absent from the session: follow the connection steps in `reverse-engineer-anything`. Show the dry-run setup plan and get approval before any setup writes configuration.
- Target needs access you do not have (a server, private code, paid account): stop. Analyze only what you can already see locally or through an API you are allowed to use.
- A finding is Inferred and a design decision depends on it: test it before building on it.
- Expensive analysis is already saved: a cheaper model can do the rebuild from the saved findings. (The video suggests this; untested.)

## Output template
```
Feature: [app] - [behavior]
Route: [web | Electron/JS | native | Android]
Findings:
  Seen:     ... (Evidence ID)
  Inferred: ... (test: ...)
  Unknown:  ...
Rebuild: files changed ...
Tests: [case] pass/fail ...
Open gaps: ...
```

## Common mistakes
- Pointing the agent at a whole app with no feature named.
- Re-running the full analysis instead of reading the saved summary.
- Treating Inferred findings as fact.
- Copying code, assets, branding or UI. Rebuild the behavior only.
- Shipping after one build without running the tests.

## Legal and safety guardrails
- Never copy exact code or assets. Rebuild the behavior with your own code.
- Analyze only artifacts you are allowed to have. Do not try to get into servers or private codebases.
- Check the target's terms of service and license before reverse engineering commercial software for client work. This is not legal advice; ask counsel when the stakes are real.
- Never put API keys or credentials in findings files.

## Last verified: 2026-10-15

## Open questions
- Creator name is not in the transcript (UNCLEAR).
- The video's star counts and speed comparisons are its own claims, not verified here.
- "Route by build" is described loosely in the video. This skill uses the routing table in the REA skill.
