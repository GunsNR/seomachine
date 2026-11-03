/**
 * Synthetic fixtures for the local walkthrough. Every workspace is
 * isFixture=true and shows "Demo data" in the UI. All people, businesses,
 * emails (example.test) and phone numbers (555-01xx) are fictional.
 */
import bcrypt from "bcryptjs";
import { systemDb, db } from "../src/lib/db";
import { AGENCY_STAGES, CLIENT_STAGES } from "../src/lib/crm/pipelines";
import { intakeLead } from "../src/lib/crm/intake";
import { touchFromRequest } from "../src/lib/attribution";
import { createBooking, moveStage, recordOutcome, recordPayment, createProposal, createTask } from "../src/lib/crm/ops";
import type { BrandProfile } from "../src/lib/brand";
import { templatePage } from "../src/lib/site/sections";
import { createPiece, decide, schedule, submitForReview } from "../src/lib/content/publish";
import { templateVariants } from "../src/lib/content/templates";
import { startCrawl } from "../src/lib/seo/crawl";
import { runDueJobs } from "../src/lib/jobs/queue";
import { handlers } from "../src/lib/jobs/handlers";

const H = 3600_000, D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms);

async function main() {
  const tables = await systemDb.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await systemDb.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);

  const pw = await bcrypt.hash("growth-demo-local", 10);
  const owner = await systemDb.user.create({ data: { email: "owner@ranklogic.example", name: "Izzy (demo)", passwordHash: pw } });
  const staff = await systemDb.user.create({ data: { email: "staff@ranklogic.example", name: "Jordan Staff (demo)", passwordHash: pw } });
  const clientUser = await systemDb.user.create({ data: { email: "client@harborline.example", name: "Maria Okonkwo-Vandermeer (demo client)", passwordHash: pw } });

  const agency = await systemDb.workspace.create({ data: { kind: "agency", name: "Rank Logic SEO", slug: "rank-logic", isFixture: true, aiMonthlyCapMicros: 0 } });
  const harbor = await systemDb.workspace.create({ data: { kind: "client", name: "Harbor Line Plumbing & Heating of Ocean County", slug: "harbor-line", parentId: agency.id, isFixture: true } });
  const dental = await systemDb.workspace.create({ data: { kind: "client", name: "Brightside Family Dental", slug: "brightside-dental", parentId: agency.id, isFixture: true, timezone: "America/New_York" } });

  for (const w of [agency, harbor, dental]) {
    await systemDb.membership.create({ data: { userId: owner.id, workspaceId: w.id, role: "owner" } });
    await systemDb.membership.create({ data: { userId: staff.id, workspaceId: w.id, role: "member" } });
  }
  await systemDb.membership.create({ data: { userId: clientUser.id, workspaceId: harbor.id, role: "client" } });

  await db.pipeline.create({ data: { workspaceId: agency.id, name: "Agency sales", kind: "agency", stages: AGENCY_STAGES, isDefault: true } });
  for (const w of [harbor, dental]) await db.pipeline.create({ data: { workspaceId: w.id, name: "Customer leads", kind: "client", stages: CLIENT_STAGES, isDefault: true } });

  // ── Brands ──
  const harborProfile: BrandProfile = {
    businessName: "Harbor Line Plumbing & Heating", industry: "home_services", voice: "Plain, practical, calm. Explain the cause before the fix.", audience: "Homeowners in older shore houses",
    offers: ["Free estimates on water heater replacement", "Same-week repiping consultations"], serviceAreas: ["Lakewood", "Toms River", "Brick"], prohibitedClaims: ["cheapest in town", "lifetime guarantee"], phone: "(732) 555-0142",
    facts: [
      { id: "svc1", kind: "service", text: "Water heater repair and replacement", source: "Client intake call 2026-10-14", provenance: "client_supplied", review: "approved", attribution: "" },
      { id: "svc2", kind: "service", text: "Whole-house repiping", source: "Client intake call 2026-10-14", provenance: "client_supplied", review: "approved", attribution: "" },
      { id: "svc3", kind: "service", text: "Boiler service", source: "Client intake call 2026-10-14", provenance: "client_supplied", review: "approved", attribution: "" },
      { id: "cr1", kind: "credential", text: "NJ master plumber licence on file (demo — fictional number)", source: "Licence PDF shared 2026-10-15", provenance: "document", review: "approved", attribution: "" },
      { id: "st1", kind: "statistic", text: "Fixes 98% of leaks on the first visit", source: "Old website footer", provenance: "website", review: "needs_review", attribution: "" },
      { id: "t1", kind: "testimonial", text: "Explained exactly why our heater failed before quoting anything.", source: "Google review (demo)", provenance: "website", review: "needs_review", attribution: "R. P., Toms River" },
    ],
    theme: { primary: "#0b5d7a", primaryInk: "#ffffff", surface: "#ffffff", ink: "#14212b", muted: "#4b5a66", font: "system-sans", radius: "small" },
  };
  const dentalProfile: BrandProfile = {
    businessName: "Brightside Family Dental", industry: "healthcare", voice: "Warm and reassuring, no jargon.", audience: "Families in Brooklyn",
    offers: ["New patient visits"], serviceAreas: ["Park Slope", "Windsor Terrace"], prohibitedClaims: ["painless", "guaranteed results"], phone: "",
    facts: [{ id: "d1", kind: "service", text: "Family dentistry", source: "Practice manager email 2026-10-20", provenance: "client_supplied", review: "approved", attribution: "" }],
    theme: { primary: "#5b3f8c", primaryInk: "#ffffff", surface: "#fdfcff", ink: "#1e1a26", muted: "#5d5868", font: "humanist", radius: "round" },
  };
  const agencyProfile: BrandProfile = {
    businessName: "Rank Logic SEO", industry: "agency", voice: "Direct, accountable, evidence first.", audience: "Owners of home-service and healthcare businesses",
    offers: ["SEO and local SEO with honest reporting"], serviceAreas: ["South Florida", "Ocean County NJ", "Brooklyn NY"], prohibitedClaims: ["guaranteed #1", "guaranteed rankings"], phone: "",
    facts: [], theme: { primary: "#b0532c", primaryInk: "#ffffff", surface: "#ffffff", ink: "#0c0d0e", muted: "#646c6c", font: "system-sans", radius: "small" },
  };
  const brands: Record<string, { id: string; versionId: string }> = {};
  for (const [w, p, slug] of [[agency, agencyProfile, "rank-logic"], [harbor, harborProfile, "harbor-line"], [dental, dentalProfile, "brightside"]] as const) {
    const b = await db.brand.create({ data: { workspaceId: w.id, name: p.businessName, slug } });
    const v = await db.brandVersion.create({ data: { workspaceId: w.id, brandId: b.id, version: 1, profile: p, createdById: owner.id, approvedAt: new Date(), approvedBy: owner.id } });
    await db.brand.update({ where: { id: b.id, workspaceId: w.id }, data: { currentVersionId: v.id } });
    brands[w.id] = { id: b.id, versionId: v.id };
  }

  // ── Agency's own leads (workflow A) ──
  const A = { workspaceId: agency.id, userId: owner.id, role: "owner" };
  const t = (s: string, m: string, c = "", camp = "") => touchFromRequest({ landingPage: `https://ranklogic.example/audit?utm_source=${s}&utm_medium=${m}&utm_campaign=${camp}&utm_content=${c}` });
  const agencyLeads = [
    { first: "Deshawn", last: "Albright", email: "deshawn@albright-roofing.example", phone: "", service: "Local SEO audit", msg: "We dropped out of the map pack in Brick.", touch: t("google", "organic"), stage: "discovery", taskAgo: 3 * D },
    { first: "Priya", last: "Raghunathan-Castellanos", email: "priya@coastalorthodontics.example", phone: "305-555-0117", service: "Website + SEO", msg: "Two locations in Broward, site is slow.", touch: t("linkedin", "social", "post-oct-carousel", "fall-audit"), stage: "proposal", taskAgo: 1 * D },
    { first: "Tom", last: "Weiss", email: "", phone: "718-555-0190", service: "", msg: "Called after the Brooklyn chamber talk.", touch: touchFromRequest({}), stage: "prospect", taskAgo: 6 * D },
    { first: "Gabriela", last: "Nunes", email: "gabi@nunes-hvac.example", phone: "732-555-0133", service: "SEO retainer", msg: "Referred by a client.", touch: t("referral", "referral"), stage: "won", taskAgo: 0 },
  ];
  for (const [i, l] of agencyLeads.entries()) {
    const r = await intakeLead({ workspaceId: agency.id, formKey: "agency:audit", idempotencyKey: `seed-a-${i}`, input: { firstName: l.first, lastName: l.last, email: l.email, phone: l.phone, service: l.service, message: l.msg }, touch: l.touch, channel: "form", isFixture: true });
    if (l.stage !== "prospect") await moveStage(A, r.opportunityId!, l.stage);
    await db.task.updateMany({ where: { workspaceId: agency.id, contactId: r.contactId }, data: { dueAt: l.taskAgo ? ago(l.taskAgo) : new Date(Date.now() + 3 * H), ...(l.stage === "won" ? { status: "done" } : {}) } });
    await db.opportunity.update({ where: { id: r.opportunityId!, workspaceId: agency.id }, data: { lastActivityAt: ago(l.taskAgo + 2 * D), createdAt: ago(l.taskAgo + 3 * D) } });
    if (l.stage === "proposal") {
      const p = await createProposal(A, r.opportunityId!, { title: "SEO + website rebuild — Coastal Orthodontics", scope: "Rebuild two location pages and run local SEO for both offices.", deliverables: ["Two location pages", "Google Business Profile clean-up", "Monthly outcome report"], lineItems: [{ kind: "one_time", label: "Website rebuild", amountMinor: 450000 }, { kind: "retainer", label: "Local SEO", amountMinor: 150000, interval: "month", termMonths: 6 }], currency: "USD" });
      await db.proposal.update({ where: { id: p.id, workspaceId: agency.id }, data: { status: "sent", sentAt: ago(4 * D) } });
    }
    if (l.stage === "won") {
      await recordOutcome(A, r.opportunityId!, "job_value", { valueMinor: 900000 });
      await recordPayment(A, r.opportunityId!, { kind: "payment", amountMinor: 150000, currency: "USD", receivedAt: ago(2 * D), note: "First month retainer" });
    }
  }
  const tom = await db.contact.findFirst({ where: { workspaceId: agency.id, firstName: "Tom" } });
  if (tom) await createBooking(A, { contactId: tom.id, title: "Discovery call", startsAt: new Date(Date.now() + 2 * D), durationMin: 30, timezone: "America/New_York" });

  // ── Harbor Line leads (workflow B) ──
  const HB = { workspaceId: harbor.id, userId: owner.id, role: "owner" };
  await db.workflow.create({ data: { workspaceId: harbor.id, name: "New lead: reply within the hour", trigger: "form_submitted", enabled: true, versions: { create: { workspaceId: harbor.id, version: 1, definition: { steps: [{ type: "create_task", title: "Call {{first_name}} back", dueInMinutes: 60 }, { type: "wait", minutes: 1440 }, { type: "send_message", channel: "email", subject: "Following up on your request", body: "Hi {{first_name}}, it's {{business}}. Still need help? Reply and we'll book a time." }] } } } } });
  const ht = (c: string, s = "google", m = "organic") => touchFromRequest({ landingPage: `https://harborline.example/water-heaters?utm_source=${s}&utm_medium=${m}&utm_campaign=fall-heaters&utm_content=${c}` });
  const hl = [
    { f: "Christopher", l: "Montgomery-Abernathy III", e: "c.montgomery.abernathy@example.test", p: "732-555-0161", s: "Water heater replacement", m: "Our 15-year-old tank is leaking from the bottom.", tc: ht("gbp-post-11", "google", "local"), stage: "estimate_booked", due: -2 * D },
    { f: "Lena", l: "Park", e: "lena.park@example.test", p: "", s: "Boiler service", m: "Annual service before winter.", tc: ht("carousel-oct-2", "instagram", "social"), stage: "won", due: 0 },
    { f: "", l: "", e: "", p: "732-555-0177", s: "Emergency leak", m: "Water under the sink, please call.", tc: touchFromRequest({}), stage: "new", due: -5 * H },
    { f: "Ahmed", l: "Farouk", e: "ahmed.farouk@example.test", p: "732-555-0177", s: "Repiping estimate", m: "Galvanized pipes, low pressure upstairs.", tc: ht("blog-galvanized"), stage: "contacted", due: -9 * D },
    { f: "Rosa", l: "Delgado", e: "rosa.d@example.test", p: "732-555-0188", s: "Water heater", m: "No hot water.", tc: ht("", "facebook", "paid"), stage: "lost", due: 0 },
  ];
  for (const [i, l] of hl.entries()) {
    const r = await intakeLead({ workspaceId: harbor.id, formKey: "site:harbor-line:home", idempotencyKey: `seed-h-${i}`, input: { firstName: l.f, lastName: l.l, email: l.e, phone: l.p, service: l.s, message: l.m, consentEmail: !!l.e, consentWording: "You can email me about this request." }, touch: l.tc, channel: "form", isFixture: true });
    if (l.stage === "lost") await moveStage(HB, r.opportunityId!, "lost", "Went with a company that could come the same day");
    else if (l.stage !== "new") await moveStage(HB, r.opportunityId!, l.stage);
    if (l.due) await db.task.updateMany({ where: { workspaceId: harbor.id, contactId: r.contactId, idempotencyKey: `intake:${r.submissionId}` }, data: { dueAt: new Date(Date.now() + l.due) } });
    else await db.task.updateMany({ where: { workspaceId: harbor.id, contactId: r.contactId }, data: { status: "done" } });
    if (l.stage === "estimate_booked") await createBooking(HB, { contactId: r.contactId!, opportunityId: r.opportunityId, title: "In-home estimate", startsAt: new Date(Date.now() + 1 * D + 3 * H), durationMin: 60, timezone: "America/New_York" });
    if (l.stage === "won") {
      await recordOutcome(HB, r.opportunityId!, "job_value", { valueMinor: 38500 });
      await recordPayment(HB, r.opportunityId!, { kind: "payment", amountMinor: 38500, currency: "USD", receivedAt: ago(1 * D) });
      await recordPayment(HB, r.opportunityId!, { kind: "refund", amountMinor: 5000, currency: "USD", receivedAt: ago(1 * H), note: "Parts credit" });
    }
  }
  const anon = await db.contact.findFirst({ where: { workspaceId: harbor.id, firstName: "" } });
  if (anon) await createTask(HB, { contactId: anon.id, title: "Call back about the leak — no name given", dueAt: ago(5 * H) });
  // Run the follow-up automation's first steps; the send step will be held (no verified sender).
  await runDueJobs(handlers);

  // ── Dental (healthcare, minimal fields) ──
  await intakeLead({ workspaceId: dental.id, formKey: "site:brightside:home", idempotencyKey: "seed-d-0", input: { firstName: "Noor", lastName: "Haddad", email: "noor.h@example.test", service: "New patient visit" }, touch: touchFromRequest({ referrer: "https://www.google.com/" }), channel: "form", isFixture: true });

  // ── Websites ──
  for (const [w, p, slug] of [[harbor, harborProfile, "harbor-line"], [dental, dentalProfile, "brightside-dental"]] as const) {
    const site = await db.site.create({ data: { workspaceId: w.id, brandId: brands[w.id]!.id, name: p.businessName, slug, theme: p.theme } });
    const home = templatePage(p, "home");
    const pg = await db.page.create({ data: { workspaceId: w.id, siteId: site.id, slug: "home", kind: "home", draftVersion: 1, publishedVersion: 1 } });
    await db.pageVersion.create({ data: { workspaceId: w.id, pageId: pg.id, version: 1, sections: home.sections, meta: w.id === harbor.id ? { ...home.meta, title: "Harbor Line Plumbing & Heating of Ocean County — Water Heaters, Repiping, Boilers" } : home.meta, origin: "template", note: "Template from brand profile (not AI)", createdById: owner.id } });
    if (w.id === harbor.id) {
      const lp = templatePage(p, "landing", "Water heater replacement");
      const lpg = await db.page.create({ data: { workspaceId: w.id, siteId: site.id, slug: "water-heaters", kind: "service", draftVersion: 1, publishedVersion: 1 } });
      await db.pageVersion.create({ data: { workspaceId: w.id, pageId: lpg.id, version: 1, sections: lp.sections, meta: { ...lp.meta, description: "" }, origin: "template", note: "Template from brand profile (not AI)", createdById: owner.id } });
    }
    await startCrawl({ workspaceId: w.id, userId: owner.id }, { siteId: site.id });
  }
  await runDueJobs(handlers);

  // ── Content ──
  const HC = { workspaceId: harbor.id, userId: staff.id, role: "member" };
  const li = await db.destination.create({ data: { workspaceId: harbor.id, brandId: brands[harbor.id]!.id, platform: "linkedin", label: "Harbor Line on LinkedIn (dry run)", adapter: "dry_run", status: "connected" } });
  const fb = await db.destination.create({ data: { workspaceId: harbor.id, brandId: brands[harbor.id]!.id, platform: "facebook", label: "Harbor Line Facebook Page (dry run)", adapter: "dry_run", status: "connected" } });
  const ig = await db.destination.create({ data: { workspaceId: harbor.id, brandId: brands[harbor.id]!.id, platform: "instagram", label: "@harborline (not connected)", adapter: "manual", status: "manual_handoff" } });
  await db.destination.create({ data: { workspaceId: harbor.id, brandId: brands[harbor.id]!.id, platform: "tiktok", label: "TikTok (blocked: needs audited app or provider)", adapter: "manual", status: "not_connected" } });
  const brief = await db.contentBrief.create({ data: { workspaceId: harbor.id, brandId: brands[harbor.id]!.id, brandVersionId: brands[harbor.id]!.versionId, objective: "Water heater estimate requests", audienceQuestion: "Why is my water heater making a popping noise", cta: "Book a free estimate", destinationUrl: "https://harborline.example/water-heaters", campaignKey: "fall-heaters", contentKey: "popping-noise-1" } });
  await db.researchSource.create({ data: { workspaceId: harbor.id, brandId: brands[harbor.id]!.id, url: "https://www.energy.gov/energysaver/water-heating", title: "Water Heating (U.S. Department of Energy)", publisher: "U.S. DOE", retrievedAt: new Date(), excerpt: "Background reading on water heater types. Not yet checked for the specific claim used in this post.", evidence: "discovery" } });
  const tv = templateVariants(harborProfile, brief, ["linkedin", "facebook", "instagram"]);
  const p1 = await createPiece(HC, { brandId: brands[harbor.id]!.id, briefId: brief.id, title: "Why water heaters pop (and when to worry)", variants: tv.variants, asset: tv.asset, generator: "template", isFixture: true });
  await db.contentPiece.update({ where: { id: p1.id, workspaceId: harbor.id }, data: { scheduledFor: new Date(Date.now() + 2 * D) } });
  await submitForReview(HC, p1.id);
  const tv2 = templateVariants(harborProfile, { ...brief, audienceQuestion: "Is it time to repipe an older shore house", contentKey: "repipe-1" }, ["linkedin", "facebook"]);
  tv2.variants[1]!.caption += " [[fail]]"; // demonstrates a per-destination failure in the dry run
  const p2 = await createPiece(HC, { brandId: brands[harbor.id]!.id, title: "Repiping older shore houses", variants: tv2.variants, asset: tv2.asset, generator: "template", isFixture: true });
  await decide(HB, p2.id, { decision: "approved", destinationIds: [li.id, fb.id], scheduleAt: null });
  await schedule(HB, p2.id);
  const tv3 = templateVariants(harborProfile, { ...brief, audienceQuestion: "What does a boiler tune-up include", contentKey: "boiler-1" }, ["instagram"]);
  await createPiece(HC, { brandId: brands[harbor.id]!.id, title: "Boiler tune-up checklist", variants: tv3.variants, asset: tv3.asset, generator: "template", isFixture: true });
  void ig;
  await runDueJobs(handlers);

  console.log("Seeded. Sign in at /login with owner@ranklogic.example (staff) or client@harborline.example (client portal). Password: growth-demo-local (local demo only).");
}

main().then(() => systemDb.$disconnect()).catch(async (e) => { console.error(e); await systemDb.$disconnect(); process.exit(1); });
