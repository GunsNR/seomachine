import type { Asset } from "./variants";
import type { Theme } from "../brand";
import { esc } from "../site/render";

/** One editable branded export path: 1080×1350 SVG per slide in the CLIENT's theme. */
export function slideSvg(asset: Asset, index: number, theme: Theme): string {
  const s = asset.slides[index] ?? asset.slides[0]!;
  const wrap = (t: string, n: number) => {
    const words = t.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur += " " + w;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines.slice(0, 6);
  };
  const h = wrap(s.heading, 18);
  const b = wrap(s.body, 34);
  const font = theme.font === "system-serif" ? "Georgia, serif" : "Helvetica, Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-label="${esc(s.heading)}">
<rect width="1080" height="1350" fill="${theme.surface}"/>
<rect x="0" y="0" width="1080" height="18" fill="${theme.primary}"/>
<text x="90" y="180" font-family="${font}" font-size="34" fill="${theme.muted}">${index + 1} / ${asset.slides.length}</text>
${h.map((l, i) => `<text x="90" y="${330 + i * 92}" font-family="${font}" font-weight="700" font-size="80" fill="${theme.ink}">${esc(l)}</text>`).join("")}
${b.map((l, i) => `<text x="90" y="${360 + h.length * 92 + 40 + i * 54}" font-family="${font}" font-size="40" fill="${theme.ink}">${esc(l)}</text>`).join("")}
<rect x="90" y="1180" width="900" height="2" fill="${theme.muted}"/>
<text x="90" y="1250" font-family="${font}" font-weight="700" font-size="38" fill="${theme.primary}">${esc(asset.footer)}</text>
</svg>`;
}
