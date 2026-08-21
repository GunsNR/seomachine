=== Rank Logic SuperTool ===
Contributors: ranklogic
Tags: seo, ai, chatgpt, elementor, structured data
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connect WordPress to Rank Logic SuperTool: one-click publishing with schema, cookieless AI-referral attribution, and Elementor widgets showing live answer-engine visibility.

== Description ==

Rank Logic SuperTool measures how often ChatGPT, Perplexity, Claude, Gemini, Grok and Google AI Mode name your brand. This plugin connects your WordPress site to that platform.

It is deliberately unobtrusive:

* Adds no front-end CSS and enqueues no libraries.
* Writes SEO metadata **through** Yoast or Rank Math rather than replacing them.
* Emits Article and FAQPage JSON-LD only when no other SEO plugin already does.
* The attribution snippet sets no cookies and collects no personal data.
* Your project key stays server-side — the browser never sees it.

= Elementor widgets =

Three optional widgets appear under a "Rank Logic" category in free Elementor:

1. **AI Visibility Score** — the headline 0-100 score with change since the last run.
2. **Engine Breakdown** — per-engine bars with mention and citation rates.
3. **Citation Feed** — recent answers that cited one of your pages.

All three inherit your theme typography and expose colour, size and alignment controls.

== Installation ==

1. Upload the plugin ZIP via Plugins → Add New → Upload Plugin, then activate.
2. Open the new **SuperTool** menu.
3. Paste the project key from SuperTool → Settings → Project API keys.
4. Press **Verify connection**. The project name appears when the handshake succeeds.
5. Optionally enable AI referral tracking and structured data.

== Frequently Asked Questions ==

= Does it conflict with Yoast or Rank Math? =

No. It detects whichever is active and writes into that plugin's meta fields. Structured data output is skipped entirely when either is present, so you never get duplicate Article graphs.

= Do the Elementor widgets need Elementor Pro? =

No. They register against free Elementor.

= Is the attribution tracking GDPR-compliant? =

The snippet sets no cookies and stores no personal data — it reports only that a visit arrived from a known answer-engine referrer, and which page it landed on. That places it outside consent requirements in most jurisdictions, but check with your own counsel.

= What happens if the API is unreachable? =

Widgets serve the last successful response rather than showing an error, and render nothing at all on the front end if there is no cached data. The site is never blocked on an API call.

== Changelog ==

= 1.0.0 =
* Initial release: settings and verification, SEO plugin bridge, Article and FAQ schema, cookieless AI referral attribution, and three Elementor widgets.
