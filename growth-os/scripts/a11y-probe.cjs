// Lightweight accessibility probe run inside the page (not a full audit).
// Reports: unlabeled form controls, unnamed buttons/links, images without alt,
// h1 count, small touch targets (<40px) on narrow screens, and missing main landmark.
module.exports = function probe() {
  const out = { unlabeled: [], unnamed: [], noAlt: [], h1: document.querySelectorAll("h1").length, smallTargets: 0, main: !!document.querySelector("main") };
  const name = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim();
  for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
    if (el.closest(".hp")) continue;
    const id = el.id;
    const labelled = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest("label") || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
    if (!labelled) out.unlabeled.push(el.outerHTML.slice(0, 90));
  }
  for (const el of document.querySelectorAll("button, a[href]")) if (!name(el) && !el.querySelector("img[alt]")) out.unnamed.push(el.outerHTML.slice(0, 90));
  for (const el of document.querySelectorAll("img")) if (!el.hasAttribute("alt")) out.noAlt.push(el.outerHTML.slice(0, 90));
  if (innerWidth < 500) for (const el of document.querySelectorAll("main button, main a[href], main select, main input:not([type=hidden]):not([type=checkbox]):not([type=radio])")) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.height < 40 && !el.closest("p") && getComputedStyle(el).display !== "inline") out.smallTargets++;
  }
  return out;
};
