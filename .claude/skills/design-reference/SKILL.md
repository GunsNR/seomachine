---
name: design-reference
description: See a design reference and turn it into something buildable. Captures a Behance, Dribbble or live-site page in headless Chromium (full-page tiles plus every case-study frame), or works from screenshots the person pastes, then extracts a real palette, type, shape, component and navigation brief and maps it onto an existing UI's tokens. Use this whenever someone says "make it look like this", "in the style of", "match this design", shares a Behance / Dribbble / Figma-community / Mobbin link, pastes app screenshots as a reference, or asks you to restyle a page after a case study — even if they never say "design reference".
---

# Design reference

Turn a reference the person points at into a design brief you can build from,
then apply it. The value is in *seeing* the reference rather than guessing from
its title — so get real pixels in front of you before writing a single token.

## 1. Get the reference in front of you

**A URL** — run the capture script. It uses the container's Chromium and honours
`HTTPS_PROXY`; in a cloud container behind a TLS-inspecting proxy, run the trust
script once first (it is a no-op elsewhere, and safe to repeat):

```bash
bash .claude/skills/design-reference/scripts/trust-proxy-ca.sh
node .claude/skills/design-reference/scripts/capture.mjs "<url>" design-ref
```

It writes `design-ref/tiles/tile-NN.png` (the whole page in readable slices),
`design-ref/images/NN.*` (each large frame on the page, which on Behance is the
case study itself) and `design-ref/manifest.json` (title, headings, page text,
image list, and any hosts whose requests failed).

**Exit code 5, `UNTRUSTED PROXY CERTIFICATE`** — Chromium does not trust the
proxy yet. Run `trust-proxy-ca.sh` and capture again. (It adds the proxy's CA to
the browser's trust store, the same trust curl and node already have; it never
switches certificate checking off.)

**Exit code 4, `BLOCKED BY NETWORK POLICY`** — the environment is refusing a host.
Stop there. Do not try mirrors, caches, screenshot services or other hosts to
reach the same content — that sidesteps a control the person's environment has
set, and the proxy's own guidance is to report blocked hosts rather than route
around them. Tell the person, in a few lines:

- the exact hosts from the manifest (for Behance that is usually `www.behance.net`
  for the page and `mir-s3-cdn-cf.behance.net` for the images — both are needed);
- that they can allow them in the environment's network settings (in Claude Code
  on the web: the cloud environment menu in the session title bar → Edit →
  Network access);
- that pasting 3–5 screenshots into the chat works immediately instead.

Then carry on with whatever does not depend on the reference.

**Screenshots the person pasted** — they arrive as images you can already see.
If you need them as files for the palette script, they are usually saved under
`~/.claude/uploads/`; otherwise ask the person to attach them as files.

## 2. Look before you extract

Read the tiles and frames with the Read tool — they are images. Order matters:

1. Skim `manifest.json` headings to find where the style guide and the final
   screens are (case studies open with research and personas; the UI is later).
2. Find the **style-guide frame** if there is one. It usually states the
   typefaces and hex values outright — those are facts, and they beat anything
   you infer.
3. Look at 3–6 final screens: home, a list, a detail, a form, navigation.

## 3. Extract the palette from pixels

```bash
node .claude/skills/design-reference/scripts/palette.mjs design-ref/images/*.png design-ref/images/*.jpg --n 14 --out design-ref
```

Point it at the frames that show *screens*, not photos or process diagrams, or the
palette fills up with skin tones and whiteboard grey. It clusters colours in
OKLab (so near-identical greys merge), reports each colour's share, lightness,
chroma and contrast, guesses roles (background, surface, ink, muted, accents),
and renders `swatches.png` — Read it to check the guesses against the screens.
Role guesses are a starting point; correct them from what you saw.

## 4. Write the brief

Use `references/brief-template.md`. Mark each line **stated** or **observed**,
and never present an observed font name as a fact — say "a geometric rounded
sans, closest Google Fonts: …". Being explicit about what is inferred is what
makes the brief trustworthy enough to build from.

## 5. Apply it to the target

Map the brief onto the target's existing tokens and components (the template's
last table), change tokens first and components second, then screenshot the
result at phone and desktop width and compare it side by side with the
reference frames. Adjust once, then show the person.

Take the reference's *system* — palette roles, type, shape, density, layout
patterns, navigation model. Do not lift its illustrations, photos, icons or copy
into a product: a case study is someone's portfolio, and the goal is a design
language, not a clone.

## Scripts

| Script | Does | Needs |
|---|---|---|
| `scripts/trust-proxy-ca.sh [ca.crt]` | Lets Chromium trust a TLS-inspecting proxy's CA (installs `certutil` if missing) | apt, or `certutil` already present |
| `scripts/capture.mjs <url> [out] [--width 1440] [--max-tiles 40]` | Renders, scrolls, tiles, downloads frames. Exit 4 = network policy block, 5 = proxy CA untrusted | Node ≥ 22, Chromium (auto-found; or `CHROME=`) |
| `scripts/palette.mjs <images…> [--n 12] [--merge 0.018] [--out dir]` | Palette split into neutrals, pastel tints and accents; roles, contrast, swatch sheet | Node ≥ 22, Chromium |

`palette.mjs` was checked against a UI whose tokens were known: it recovered all
ten (background, white surface, ink, two accents, five pastel tints) to within a
few units per channel. Small but vivid colours (a button, an alert) are kept on
purpose even at a fraction of a percent of the pixels; anti-aliased text edges
are dropped as blends. Raise `--merge` if near-duplicates clutter the result.
