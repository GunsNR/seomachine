/**
 * Bounded, deterministic audit rules. Pure: input is what the crawler saw.
 * Each finding states its evidence, freshness, a proposed change, an impact
 * hypothesis (not a promise), effort, risk and how to verify.
 */

export type CrawledPage = {
  url: string;
  status: number;
  title: string;
  description: string;
  h1: string[];
  canonical: string;
  noindex: boolean;
  wordCount: number;
  internalLinks: string[];
  schemaTypes: string[];
  inSitemap: boolean;
  textHash: string;
  shingles?: Set<string>;
};

export type Finding = {
  rule: string;
  severity: "high" | "medium" | "low";
  urls: string[];
  finding: string;
  evidence: Record<string, unknown>;
  proposedChange: string;
  impactHypothesis: string;
  effort: "S" | "M" | "L";
  risk: "low" | "medium" | "high";
  verification: string;
  businessIntent: string;
};

export function shingles(text: string, k = 5): Set<string> {
  const w = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const norm = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "");

export function auditPages(pages: CrawledPage[], opts: { intent?: (url: string) => string } = {}): Finding[] {
  const out: Finding[] = [];
  const intent = opts.intent ?? (() => "");
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300);
  const known = new Map(pages.map((p) => [norm(p.url), p]));

  for (const p of ok) {
    const bi = intent(p.url);
    if (!p.title.trim()) out.push({ rule: "title_missing", severity: "high", urls: [p.url], finding: "Page has no title.", evidence: { title: p.title }, proposedChange: "Write a title naming the service and place, under 60 characters.", impactHypothesis: "A specific title can improve how the result reads in search; ranking effect is not guaranteed.", effort: "S", risk: "low", verification: "Recrawl: <title> present and unique.", businessIntent: bi });
    else if (p.title.length > 60) out.push({ rule: "title_long", severity: "low", urls: [p.url], finding: `Title is ${p.title.length} characters and may be cut off in results.`, evidence: { title: p.title, length: p.title.length }, proposedChange: "Shorten to 60 characters or fewer, keeping the service and place first.", impactHypothesis: "Less truncation may help click-through; measure in Search Console over 4+ weeks.", effort: "S", risk: "low", verification: "Recrawl: title ≤ 60 characters.", businessIntent: bi });
    if (!p.description.trim()) out.push({ rule: "description_missing", severity: "medium", urls: [p.url], finding: "No meta description.", evidence: {}, proposedChange: "Add a 120–160 character description stating the offer and area.", impactHypothesis: "Search engines may use it as the snippet; they can also ignore it.", effort: "S", risk: "low", verification: "Recrawl: meta description present.", businessIntent: bi });
    if (p.h1.length === 0) out.push({ rule: "h1_missing", severity: "medium", urls: [p.url], finding: "No H1 heading.", evidence: { h1: p.h1 }, proposedChange: "Add one H1 that names the page's main service.", impactHypothesis: "Clearer page topic for people and crawlers.", effort: "S", risk: "low", verification: "Recrawl: exactly one H1.", businessIntent: bi });
    if (p.h1.length > 1) out.push({ rule: "h1_multiple", severity: "low", urls: [p.url], finding: `${p.h1.length} H1 headings.`, evidence: { h1: p.h1 }, proposedChange: "Keep one H1; make the others H2.", impactHypothesis: "Clearer document outline.", effort: "S", risk: "low", verification: "Recrawl: exactly one H1.", businessIntent: bi });
    if (!p.canonical) out.push({ rule: "canonical_missing", severity: "low", urls: [p.url], finding: "No canonical URL.", evidence: {}, proposedChange: "Add a self-referencing canonical.", impactHypothesis: "Reduces duplicate-URL ambiguity.", effort: "S", risk: "low", verification: "Recrawl: canonical present.", businessIntent: bi });
    else if (norm(p.canonical) !== norm(p.url) && known.has(norm(p.canonical)) === false) out.push({ rule: "canonical_unknown_target", severity: "medium", urls: [p.url], finding: "Canonical points to a URL that was not found on the site.", evidence: { canonical: p.canonical }, proposedChange: "Point the canonical at this page or at an existing equivalent.", impactHypothesis: "A broken canonical can keep the page out of the index.", effort: "S", risk: "medium", verification: "Recrawl: canonical target returns 200.", businessIntent: bi });
    if (p.noindex && p.inSitemap) out.push({ rule: "noindex_in_sitemap", severity: "high", urls: [p.url], finding: "Page is listed in the sitemap but tells search engines not to index it.", evidence: { noindex: true, inSitemap: true }, proposedChange: "Decide: remove noindex, or remove it from the sitemap.", impactHypothesis: "Conflicting signals waste crawl attention.", effort: "S", risk: "medium", verification: "Recrawl: consistent robots and sitemap.", businessIntent: bi });
    if (!p.noindex && !p.inSitemap) out.push({ rule: "not_in_sitemap", severity: "low", urls: [p.url], finding: "Indexable page missing from the sitemap.", evidence: {}, proposedChange: "Add it to the sitemap.", impactHypothesis: "Helps discovery; a sitemap does not guarantee indexing.", effort: "S", risk: "low", verification: "Sitemap lists the URL.", businessIntent: bi });
    if (p.wordCount < 150) out.push({ rule: "thin_content", severity: "medium", urls: [p.url], finding: `Only ${p.wordCount} words of visible text.`, evidence: { wordCount: p.wordCount }, proposedChange: "Add useful specifics: services, process, areas, FAQs from real customer questions.", impactHypothesis: "More useful detail can help the page match more queries; word count alone is not a ranking factor.", effort: "M", risk: "low", verification: "Recrawl word count; watch Search Console impressions for the page.", businessIntent: bi });
    if (!p.schemaTypes.length) out.push({ rule: "schema_missing", severity: "low", urls: [p.url], finding: "No structured data.", evidence: {}, proposedChange: "Add structured data that matches visible content (e.g. LocalBusiness name and areas shown on the page).", impactHypothesis: "Makes facts machine-readable. It does not guarantee rich results or AI citations.", effort: "S", risk: "low", verification: "Recrawl: JSON-LD parses and matches visible text.", businessIntent: bi });
    for (const l of p.internalLinks) {
      const t = known.get(norm(l));
      if (t && t.status >= 400) out.push({ rule: "broken_internal_link", severity: "high", urls: [p.url], finding: `Links to a page returning ${t.status}.`, evidence: { target: l, status: t.status }, proposedChange: "Fix or remove the link, or restore the target page.", impactHypothesis: "Visitors and crawlers stop hitting dead ends.", effort: "S", risk: "low", verification: "Recrawl: no internal links to 4xx/5xx.", businessIntent: bi });
    }
  }

  // Duplicate titles across pages.
  const byTitle = new Map<string, string[]>();
  for (const p of ok) if (p.title) byTitle.set(p.title.toLowerCase(), [...(byTitle.get(p.title.toLowerCase()) ?? []), p.url]);
  for (const [title, urls] of byTitle) if (urls.length > 1) out.push({ rule: "title_duplicate", severity: "medium", urls, finding: `${urls.length} pages share the same title.`, evidence: { title }, proposedChange: "Give each page a title that names its own service or area.", impactHypothesis: "Distinct titles help each page earn its own queries.", effort: "S", risk: "low", verification: "Recrawl: titles unique.", businessIntent: "" });

  // Near-duplicate body text (e.g. city pages that only swap the town name).
  const withSh = ok.filter((p) => p.shingles && p.shingles.size > 20);
  for (let i = 0; i < withSh.length; i++)
    for (let j = i + 1; j < withSh.length; j++) {
      const sim = jaccard(withSh[i]!.shingles!, withSh[j]!.shingles!);
      if (sim >= 0.8) out.push({ rule: "near_duplicate", severity: "high", urls: [withSh[i]!.url, withSh[j]!.url], finding: `Pages are ${Math.round(sim * 100)}% the same text.`, evidence: { similarity: Number(sim.toFixed(2)) }, proposedChange: "Merge them, or rewrite one with genuinely local specifics (jobs done there, local conditions, real FAQs).", impactHypothesis: "Near-identical pages tend to compete with each other and read as low value.", effort: "M", risk: "medium", verification: "Recrawl: similarity below 0.8.", businessIntent: "" });
    }

  for (const p of pages.filter((x) => x.status === 0)) out.push({ rule: "fetch_failed", severity: "medium", urls: [p.url], finding: "Couldn't fetch this page.", evidence: { error: (p as CrawledPage & { error?: string }).error ?? "no response" }, proposedChange: "Check the address is public and reachable, then re-run the audit.", impactHypothesis: "Unknown until the page can be read — this is a gap in the audit, not a clean result.", effort: "S", risk: "low", verification: "Re-run: the page returns a status code.", businessIntent: "" });
  for (const p of pages.filter((x) => x.status >= 400)) out.push({ rule: "error_status", severity: "high", urls: [p.url], finding: `Returns HTTP ${p.status}.`, evidence: { status: p.status }, proposedChange: "Restore the page or redirect it to the closest equivalent.", impactHypothesis: "Recovers any links and visitors pointed at it.", effort: "S", risk: "medium", verification: "Recrawl: 200 or a single redirect.", businessIntent: "" });
  return out;
}
