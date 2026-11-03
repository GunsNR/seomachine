import { approvedFacts, type BrandProfile, type Theme } from "../brand";
import type { PageMeta, Section } from "./sections";

/**
 * Server-side HTML for client websites. Pure string rendering with escaping,
 * shared by the public route, private preview, export and the SEO crawler so
 * all four see byte-identical markup. Uses the CLIENT's theme only.
 */

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FONTS: Record<Theme["font"], string> = {
  "system-sans": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  "system-serif": 'Georgia, "Times New Roman", serif',
  humanist: '"Gill Sans", "Seravek", "Trebuchet MS", sans-serif',
  geometric: '"Avenir Next", "Avenir", "Century Gothic", sans-serif',
};

export type RenderInput = {
  siteSlug: string;
  siteName: string;
  baseUrl: string; // absolute origin + path prefix for canonical, e.g. http://localhost:3100/s/acme
  pageSlug: string;
  sections: Section[];
  meta: PageMeta;
  brand: BrandProfile;
  theme: Theme;
  mode: "public" | "preview" | "export";
  formAction: string;
  navPages: { slug: string; label: string }[];
};

function pageUrl(base: string, slug: string) {
  // No trailing slash: Next.js redirects /s/site/ → /s/site, and a canonical must not point at a redirect.
  return slug === "" || slug === "home" ? base : `${base}/${slug}`;
}

function sectionHtml(s: Section, r: RenderInput): string {
  const facts = approvedFacts(r.brand);
  switch (s.type) {
    case "hero": {
      const proof = facts.find((f) => f.id === s.proofFactId);
      const href = s.ctaTarget === "phone" && r.brand.phone ? `tel:${esc(r.brand.phone.replace(/[^\d+]/g, ""))}` : s.ctaTarget === "booking" ? "#book" : "#request";
      return `<section class="hero" id="${esc(s.id)}"><div class="wrap"><h1>${esc(s.headline)}</h1>${s.subhead ? `<p class="lead">${esc(s.subhead)}</p>` : ""}<a class="btn" href="${href}">${esc(s.ctaLabel)}</a>${proof ? `<p class="proof">${esc(proof.text)}${proof.attribution ? ` <span>— ${esc(proof.attribution)}</span>` : ""}</p>` : ""}</div></section>`;
    }
    case "benefits":
      return `<section id="${esc(s.id)}"><div class="wrap"><h2>${esc(s.heading)}</h2><ul class="grid">${s.items.map((i) => `<li><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></li>`).join("")}</ul></div></section>`;
    case "services":
      return `<section id="${esc(s.id)}"><div class="wrap"><h2>${esc(s.heading)}</h2><ul class="grid">${s.items.map((i) => `<li><h3>${esc(i.name)}</h3>${i.body ? `<p>${esc(i.body)}</p>` : ""}</li>`).join("")}</ul></div></section>`;
    case "proof": {
      const shown = s.factIds.map((id) => facts.find((f) => f.id === id)).filter(Boolean);
      if (!shown.length) return "";
      return `<section id="${esc(s.id)}" class="alt"><div class="wrap"><h2>${esc(s.heading)}</h2><ul class="proofs">${shown.map((f) => `<li><p>${esc(f!.text)}</p>${f!.attribution ? `<p class="who">${esc(f!.attribution)}</p>` : ""}</li>`).join("")}</ul></div></section>`;
    }
    case "faq":
      return `<section id="${esc(s.id)}"><div class="wrap"><h2>${esc(s.heading)}</h2>${s.items.map((i) => `<details><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`).join("")}</div></section>`;
    case "lead_form": {
      const healthcare = r.brand.industry === "healthcare";
      return `<section id="request" class="alt"><div class="wrap narrow"><h2>${esc(s.heading)}</h2>${s.body ? `<p>${esc(s.body)}</p>` : ""}
<form method="post" action="${esc(r.formAction)}" class="form" ${r.mode === "export" ? "" : 'data-gos-form="1"'}>
<input type="hidden" name="idempotencyKey" value="">
<input type="hidden" name="landingPage" value=""><input type="hidden" name="referrer" value="">
<div class="hp" aria-hidden="true"><label>Leave this empty<input name="company_website" tabindex="-1" autocomplete="off"></label></div>
<div class="row"><label for="f-first">First name</label><input id="f-first" name="firstName" autocomplete="given-name" required maxlength="80"></div>
<div class="row"><label for="f-last">Last name</label><input id="f-last" name="lastName" autocomplete="family-name" maxlength="80"></div>
<div class="row"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" maxlength="254"></div>
<div class="row"><label for="f-phone">Phone</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
${s.askService ? `<div class="row"><label for="f-service">${healthcare ? "Which service are you asking about?" : "What do you need?"}</label><input id="f-service" name="service" maxlength="120"></div>` : ""}
${healthcare ? "" : `<div class="row"><label for="f-msg">Details (optional)</label><textarea id="f-msg" name="message" rows="4" maxlength="4000"></textarea></div>`}
${s.consentText ? `<div class="check"><input id="f-consent" type="checkbox" name="consentEmail" value="yes"><label for="f-consent">${esc(s.consentText)}</label><input type="hidden" name="consentWording" value="${esc(s.consentText)}"></div>` : ""}
<p class="note">Please give an email or a phone number.</p>
<button class="btn" type="submit">${esc(s.submitLabel)}</button></form></div></section>`;
    }
    case "booking_cta":
      return `<section id="book"><div class="wrap narrow"><h2>${esc(s.heading)}</h2>${s.body ? `<p>${esc(s.body)}</p>` : ""}<a class="btn" href="#request">${esc(s.label)}</a></div></section>`;
    case "footer":
      return `<footer><div class="wrap"><p>${esc(s.text)}</p></div></footer>`;
  }
}

function jsonLd(r: RenderInput): string {
  if (r.meta.schemaType === "none") return "";
  // Only facts visible on the page: name, and areas served when the FAQ lists them.
  const visibleText = JSON.stringify(r.sections);
  const areas = r.brand.serviceAreas.filter((a) => visibleText.includes(a));
  const data: Record<string, unknown> = { "@context": "https://schema.org", "@type": r.meta.schemaType, name: r.brand.businessName, url: pageUrl(r.baseUrl, r.pageSlug) };
  if (areas.length) data.areaServed = areas;
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

export function renderPageHtml(r: RenderInput): string {
  const t = r.theme;
  const radius = t.radius === "none" ? "0" : t.radius === "round" ? "14px" : "6px";
  const canonical = r.meta.canonicalPath ? `${r.baseUrl}${r.meta.canonicalPath.startsWith("/") ? "" : "/"}${r.meta.canonicalPath}` : pageUrl(r.baseUrl, r.pageSlug);
  const robots = r.mode === "preview" || r.meta.noindex ? "noindex, nofollow" : "index, follow";
  const nav = r.navPages.length > 1 ? `<nav aria-label="Main"><div class="wrap navrow"><a class="brand" href="${esc(pageUrl(r.baseUrl, ""))}">${esc(r.brand.businessName)}</a><ul>${r.navPages.map((p) => `<li><a href="${esc(pageUrl(r.baseUrl, p.slug))}"${p.slug === r.pageSlug ? ' aria-current="page"' : ""}>${esc(p.label)}</a></li>`).join("")}</ul></div></nav>` : `<nav aria-label="Main"><div class="wrap navrow"><a class="brand" href="${esc(pageUrl(r.baseUrl, ""))}">${esc(r.brand.businessName)}</a></div></nav>`;
  const banner = r.mode === "preview" ? `<div class="preview-bar" role="status">Private preview — not public, not indexed</div>` : "";
  const script = r.mode === "export" ? "" : `<script>(function(){var f=document.querySelector('[data-gos-form]');if(!f)return;var k=f.querySelector('[name=idempotencyKey]');k.value=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random());f.querySelector('[name=landingPage]').value=location.href;f.querySelector('[name=referrer]').value=document.referrer;f.addEventListener('submit',function(){var b=f.querySelector('button[type=submit]');setTimeout(function(){b.disabled=true;b.textContent='Sending…'},0)});})();</script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.meta.title)}</title><meta name="description" content="${esc(r.meta.description)}"><meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}"><meta property="og:title" content="${esc(r.meta.ogTitle || r.meta.title)}"><meta property="og:description" content="${esc(r.meta.description)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(canonical)}">
${jsonLd(r)}
<style>
:root{--p:${t.primary};--pi:${t.primaryInk};--s:${t.surface};--i:${t.ink};--m:${t.muted};--r:${radius}}
*{box-sizing:border-box}body{margin:0;font-family:${FONTS[t.font]};color:var(--i);background:var(--s);line-height:1.6;font-size:17px}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}.narrow{max-width:640px}
nav{border-bottom:1px solid color-mix(in srgb,var(--i) 12%,transparent)}.navrow{display:flex;gap:16px;align-items:center;justify-content:space-between;min-height:60px;flex-wrap:wrap}
.brand{font-weight:700;color:var(--i);text-decoration:none}nav ul{display:flex;gap:16px;list-style:none;margin:0;padding:0;flex-wrap:wrap}nav a{color:var(--i)}nav a[aria-current]{font-weight:700}
section{padding:56px 0}.alt{background:color-mix(in srgb,var(--p) 7%,var(--s))}
.hero{padding:72px 0 64px}h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.1;margin:0 0 16px;max-width:20ch}
h2{font-size:clamp(1.5rem,3vw,2rem);line-height:1.2;margin:0 0 20px}h3{margin:0 0 6px;font-size:1.1rem}
.lead{font-size:1.2rem;color:var(--m);max-width:60ch;margin:0 0 24px}
.btn{display:inline-block;background:var(--p);color:var(--pi);padding:14px 22px;border-radius:var(--r);font-weight:700;text-decoration:none;border:0;font-size:1rem;cursor:pointer;min-height:48px}
.btn:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--i);outline-offset:3px}
.proof{margin-top:20px;color:var(--m);font-size:.95rem}
.grid{list-style:none;padding:0;display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.grid li{padding:20px;border:1px solid color-mix(in srgb,var(--i) 14%,transparent);border-radius:var(--r)}
.proofs{list-style:none;padding:0;display:grid;gap:16px}.who{color:var(--m);font-size:.9rem;margin:0}
details{border-bottom:1px solid color-mix(in srgb,var(--i) 14%,transparent);padding:14px 0}summary{cursor:pointer;font-weight:600;min-height:28px}
.form .row{display:flex;flex-direction:column;margin-bottom:14px}label{font-weight:600;margin-bottom:4px}
input,textarea{font:inherit;padding:12px;border:1px solid color-mix(in srgb,var(--i) 35%,transparent);border-radius:var(--r);background:#fff;color:#111;min-height:48px}
.check{display:flex;gap:10px;align-items:flex-start;margin-bottom:14px}.check input{min-height:auto;width:20px;height:20px;margin-top:4px}.check label{font-weight:400}
.note{color:var(--m);font-size:.9rem}.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
footer{padding:32px 0;color:var(--m);font-size:.9rem}
.preview-bar{background:#111;color:#fff;text-align:center;padding:8px;font:600 14px system-ui}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style></head><body>${banner}${nav}<main>${r.sections.map((s) => sectionHtml(s, r)).join("\n")}</main>${script}</body></html>`;
}
