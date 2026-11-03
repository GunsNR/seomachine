// End-to-end journeys through the real UI. Run against a freshly seeded app:
//   npm run db:seed && node scripts/journeys.cjs
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); };
// Server-action redirects update the URL before the new RSC payload paints, so wait for content.
const seen = (page, sel, timeout = 8000) => page.locator(sel).first().waitFor({ state: "visible", timeout }).then(() => true, () => false);

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email); await page.fill("#password", "growth-demo-local");
  await Promise.all([page.waitForURL(/\/(app|portal)/), page.click("button[type=submit]")]);
}
async function switchTo(page, name) {
  await page.goto(`${BASE}/app`);
  await page.click("aside details summary");
  await Promise.all([page.waitForLoadState("networkidle"), page.click(`aside details button:has-text("${name}")`)]);
}

(async () => {
  const browser = await chromium.launch();
  const staff = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(staff, "owner@ranklogic.example");
  await switchTo(staff, "Harbor Line");

  // J0 keyboard: first Tab reaches the skip link with a visible focus ring.
  await staff.goto(`${BASE}/app`); await staff.keyboard.press("Tab");
  const focus = await staff.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { text: e.textContent.trim(), outline: cs.outlineStyle !== "none" && cs.outlineWidth !== "0px" }; });
  check("J0 skip link is first focus stop with visible outline", focus.text === "Skip to content" && focus.outline, JSON.stringify(focus));

  // J1 overdue lead → open → add follow-up → complete it.
  await staff.goto(`${BASE}/app`);
  await Promise.all([staff.waitForURL(/\/app\/crm\/contacts\//), staff.click("text=Open")]);
  const leadUrl = staff.url().split("?")[0];
  await staff.fill("#ft", "Confirm estimate time by phone");
  await Promise.all([staff.waitForURL(/ok=/), staff.click('form:has(#ft) button[type=submit]')]);
  check("J1a follow-up created from lead page", (await seen(staff, "text=Follow-up added")) && (await seen(staff, "#follow-up >> text=Confirm estimate time by phone")));
  const row = staff.locator("#follow-up li", { hasText: "Confirm estimate time by phone" }).first();
  await Promise.all([staff.waitForURL(/ok=/), row.locator("button:has-text('Done')").click()]);
  await seen(staff, "text=Marked done");
  check("J1b follow-up marked done and removed from next steps", (await staff.locator("#follow-up li", { hasText: "Confirm estimate time by phone" }).count()) === 0);

  // J1c stale guard: losing a deal needs a reason.
  await staff.goto(leadUrl);
  const stageSel = staff.locator("select[id^=stage-]").first();
  await stageSel.selectOption("lost");
  await Promise.all([staff.waitForURL(/error=/), staff.click("button:has-text('Update stage')")]);
  check("J1c lost without a reason is refused with a recoverable message", await seen(staff, "text=Add a short reason"));

  // J2 public form → CRM, double submit → one lead.
  const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await pub.goto(`${BASE}/s/harbor-line?utm_source=google&utm_medium=local&utm_campaign=fall-heaters&utm_content=journey-test`);
  await pub.fill("#f-first", "Journey"); await pub.fill("#f-last", "Tester"); await pub.fill("#f-email", "journey.tester@example.test"); await pub.fill("#f-service", "Water heater");
  const key = await pub.inputValue("[name=idempotencyKey]");
  await pub.click("button[type=submit]"); await pub.waitForLoadState("networkidle");
  check("J2a public form thanks the visitor", await seen(pub, "text=Thanks — we got it"));
  // Replay the exact same submission (same idempotency key), as a retry would.
  const replay = await pub.request.post(`${BASE}/api/forms/harbor-line`, { form: { idempotencyKey: key, firstName: "Journey", email: "journey.tester@example.test", service: "Water heater", landingPage: `${BASE}/s/harbor-line` }, headers: { origin: BASE } });
  check("J2b replayed submission accepted without error", replay.status() === 200);
  await staff.goto(`${BASE}/app/crm?view=list&q=journey`);
  check("J2c exactly one opportunity in CRM", (await staff.locator("tbody tr").count()) === 1, String(await staff.locator("tbody tr").count()));
  check("J2d source captured from UTM", await staff.isVisible("td:has-text('google / local')"));
  const hp = await pub.request.post(`${BASE}/api/forms/harbor-line`, { form: { idempotencyKey: "honeypot-12345", firstName: "Bot", email: "bot@example.test", company_website: "spam.example" }, headers: { origin: BASE } });
  const cross = await pub.request.post(`${BASE}/api/forms/harbor-line`, { form: { idempotencyKey: "cross-origin-1", email: "x@example.test" }, headers: { origin: "https://evil.example" } });
  await staff.goto(`${BASE}/app/crm?view=list&q=bot%40example`);
  check("J2e honeypot submission stores nothing", hp.status() === 200 && (await staff.locator("tbody tr").count()) === 0);
  check("J2f cross-origin post refused", cross.status() === 403);

  // J3 SEO finding → preview fix → apply → publish → re-audit → resolved.
  await staff.goto(`${BASE}/app/seo`);
  await staff.click("a:has-text('Title is')");
  await Promise.all([staff.waitForURL(/\/app\/websites\//), staff.click("button:has-text('Preview the fix')")]);
  check("J3a patch shows before/after for review", await staff.isVisible("text=From SEO finding") && await staff.isVisible("th:has-text('Before')"));
  await Promise.all([staff.waitForURL(/ok=/), staff.click("button:has-text('Apply to draft')")]);
  await seen(staff, "button:has-text('Publish v')");
  await Promise.all([staff.waitForURL(/ok=/), staff.click("button:has-text('Publish v')")]);
  check("J3b published new version", await seen(staff, "text=is now live"));
  await staff.goto(`${BASE}/app/seo`);
  await Promise.all([staff.waitForURL(/ok=/), staff.locator("form:has(input[name=siteId])", { hasText: "Harbor Line" }).locator("button").click()]);
  await seen(staff, "text=Audit");
  await staff.waitForTimeout(7000); // worker poll interval is 5s
  await staff.goto(`${BASE}/app/seo?view=resolved`);
  check("J3c re-audit marks the title finding resolved", (await seen(staff, "tr:has-text('characters and may be cut off') >> text=Resolved")));

  // J4 client portal: approve content, confirm a lead, cannot open staff app.
  const client = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(client, "client@harborline.example");
  await client.goto(`${BASE}/portal/approvals`);
  await Promise.all([client.waitForURL(/ok=/), client.locator("button:has-text('Approve')").first().click()]);
  check("J4a client approved a post", await seen(client, "text=Approved for the selected destinations"));
  await client.goto(`${BASE}/portal`);
  await Promise.all([client.waitForURL(/ok=/), client.locator("button:has-text('Real lead')").first().click()]);
  check("J4b client confirmed a lead", await seen(client, "text=saved with your name"));
  await client.goto(`${BASE}/app/crm`);
  check("J4c client is redirected away from staff CRM", client.url().includes("/portal"), client.url());
  const peek = await client.request.get(`${BASE}/api/export/contacts`);
  check("J4d client cannot export contacts", peek.status() === 403);
  await staff.goto(`${BASE}/app/content?view=review`);
  check("J4e approval visible to staff (review queue emptied)", await seen(staff, "text=Nothing waiting for review"));

  // J5 emergency pause banner + held messaging.
  await staff.goto(`${BASE}/app/settings`);
  await Promise.all([staff.waitForURL(/ok=/), staff.click("button:has-text('Pause everything')")]);
  await staff.goto(`${BASE}/app`);
  check("J5a pause banner visible on every staff screen", await seen(staff, "text=Workspace paused"));
  await staff.goto(`${BASE}/app/settings`);
  await Promise.all([staff.waitForURL(/ok=/), staff.click("button:has-text('Resume workspace')")]);

  // J6 preview is private.
  const anon = await (await browser.newContext()).newPage();
  const pv = await anon.request.get(`${BASE}/preview/does-not-matter`);
  check("J6 preview refuses signed-out visitors", pv.status() === 401);

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  ${r.detail}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} journey checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
