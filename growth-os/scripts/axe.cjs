// axe-core WCAG 2.2 AA audit of key screens in a real browser.
// Usage (app running with demo data): node scripts/axe.cjs
const { chromium } = require("playwright"); // pre-installed in the environment
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:3100";
const axeSrc = fs.readFileSync(path.join(__dirname, "../node_modules/axe-core/axe.min.js"), "utf8");

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email); await page.fill("#password", process.env.SEED_PASSWORD);
  await Promise.all([page.waitForURL(/\/(app|portal)/), page.click("button[type=submit]")]);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "owner@ranklogic.example");
  await page.click("aside details summary");
  await Promise.all([page.waitForLoadState("networkidle"), page.click('aside details button:has-text("Harbor Line")')]);
  const targets = ["/app", "/app/crm", "/app/crm?view=list", "/app/crm/new", "/app/content", "/app/content/new", "/app/websites", "/app/seo", "/app/reports", "/app/settings", "/app/settings/brand", "/app/settings/destinations", "/app/settings/pipeline", "/app/settings/workflows/new", "/app/settings/integrations", "/s/harbor-line"];
  // Discover a lead, a post and a page editor through the UI links.
  await page.goto(`${BASE}/app/crm?view=list`); const lead = await page.locator("tbody a").first().getAttribute("href"); if (lead) targets.push(lead);
  await page.goto(`${BASE}/app/content`); const post = await page.locator("main li a").first().getAttribute("href"); if (post) targets.push(post);
  await page.goto(`${BASE}/app/websites`); const ed = await page.locator("tbody a").first().getAttribute("href"); if (ed) targets.push(ed);
  targets.push("/login"); // last: it signs the session out
  let total = 0;
  const report = [];
  for (const t of targets) {
    if (t === "/login") { await ctx.clearCookies(); }
    await page.goto(`${BASE}${t}`, { waitUntil: "networkidle" });
    // Make sure we audited the screen we meant to, not a sign-in redirect.
    if (t !== "/login" && new URL(page.url()).pathname === "/login") throw new Error(`Redirected to sign-in while auditing ${t}`);
    await page.addScriptTag({ content: axeSrc });
    const r = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
    const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, example: x.nodes[0]?.target?.join(" ") }));
    total += v.length;
    report.push({ path: t, violations: v });
  }
  const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cp = await client.newPage();
  await login(cp, "client@harborline.example");
  for (const t of ["/portal", "/portal/approvals", "/portal/report"]) {
    await cp.goto(`${BASE}${t}`, { waitUntil: "networkidle" });
    if (new URL(cp.url()).pathname !== t) throw new Error(`Expected ${t}, got ${cp.url()}`);
    await cp.addScriptTag({ content: axeSrc });
    const r = await cp.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
    const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, example: x.nodes[0]?.target?.join(" ") }));
    total += v.length;
    report.push({ path: t, violations: v });
  }
  await browser.close();
  for (const r of report) console.log(`${r.violations.length ? "FAIL" : "PASS"}  ${r.path}${r.violations.map((v) => `\n      ${v.impact} ${v.id} ×${v.nodes} e.g. ${v.example}`).join("")}`);
  console.log(`\n${report.length} screens, ${total} violation types`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
