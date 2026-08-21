# Rank Logic SuperTool — Elementor Kit

Six importable Elementor sections that reproduce the SuperTool marketing design
inside WordPress. They use only free Elementor widgets (heading, text editor,
button, icon box, counter, accordion, image), so nothing here needs Pro.

## Importing

1. In WordPress go to **Templates → Saved Templates → Import Templates**.
2. Upload the JSON files from `templates/` one at a time.
3. Edit any page with Elementor, open the folder icon in the widget panel, and
   insert the section from **My Templates**.

## What's included

| File | Section |
| --- | --- |
| `01-hero.json` | Dark navy hero with headline, sub-copy, CTA and an image slot |
| `02-stat-bar.json` | Four animated stat counters on a light band |
| `03-services-grid.json` | Heading plus a 3×2 icon-box grid of capabilities |
| `04-process.json` | Dark four-step process row |
| `05-cta-band.json` | Full-width brand-blue conversion band |
| `06-faq.json` | Accordion FAQ (pairs with the plugin's FAQPage schema) |

## Design tokens

The palette and typography match `brand.config.ts` in the `supertool` app:

| Token | Value |
| --- | --- |
| Navy | `#07182E` |
| Brand blue | `#1466D8` |
| Accent orange | `#FF6B2C` |
| Ink | `#0B1220` |
| Body | `#4A5568` |
| Surface alt | `#F6F9FD` |
| Heading font | Manrope 700/800 |
| Body font | Inter 400/600 |

Set these once in **Site Settings → Global Colors / Global Fonts** and the
sections will inherit them everywhere.

## Regenerating

The JSON is generated rather than hand-written, so structure stays consistent:

```bash
node build-kit.mjs
```

Edit `build-kit.mjs` to change copy, colours or which sections are emitted.
