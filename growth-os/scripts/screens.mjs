// Screenshot key screens at mobile/tablet/desktop widths with a signed-in session.
// Usage: node scripts/screens.mjs <outDir> <label=path> [...]   (default: core prototype screens)
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright"); // pre-installed in the environment; not a project dependency
const probe = require("./a11y-probe.cjs");
import fs from "fs";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const out = process.argv[2] || "replica/screens";
const pairs = process.argv.slice(3);
const WIDTHS = (process.env.WIDTHS || "390,768,1440").split(",").map(Number);
const user = process.env.SCREEN_USER || "owner@ranklogic.example";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.DPR || 1) });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${BASE}/login`);
await page.fill("#email", user);
await page.fill("#password", process.env.SEED_PASSWORD);
await Promise.all([page.waitForURL(/\/(app|portal)/), page.click("button[type=submit]")]);

if (process.env.WORKSPACE) {
  // Switch the active workspace through the real switcher form.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/app`);
  await page.click("aside details summary");
  await Promise.all([page.waitForLoadState("networkidle"), page.click(`aside details button:has-text("${process.env.WORKSPACE}")`)]);
}

const targets = pairs.length ? pairs.map((p) => p.split("=")) : [["today", "/app"], ["crm-board", "/app/crm"], ["crm-list", "/app/crm?view=list"]];
const report = [];
for (const [label, path] of targets) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w < 500 ? 844 : w < 1000 ? 1024 : 900 });
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const a11y = await page.evaluate(`(${probe.toString()})()`);
    const file = `${out}/${label}-${w}.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.push({ label, w, status: resp?.status(), horizontalOverflowPx: overflow, a11y, file });
  }
}
console.log(JSON.stringify({ report, consoleErrors: errors.slice(0, 10) }, null, 1));
await browser.close();
