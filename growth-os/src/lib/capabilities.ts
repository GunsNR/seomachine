/**
 * What Growth OS can do *now*, on the claim ladder from the brief:
 * implemented → tested_fixture → sandbox_verified → live_verified, plus
 * manual_fallback / blocked / deferred. Nothing here is "live_verified":
 * no authorized real round trip has been recorded. Change a status only with
 * evidence recorded in replica/feature-matrix.md.
 */
export type CapStatus = "implemented" | "tested_fixture" | "sandbox_verified" | "live_verified" | "manual_fallback" | "blocked" | "deferred";

export type Capability = { id: string; area: string; name: string; status: CapStatus; detail: string; next?: string };

export const CAPABILITIES: Capability[] = [
  { id: "crm.intake", area: "CRM", name: "Lead intake (forms, manual, CSV) with dedupe", status: "tested_fixture", detail: "Idempotent per submission; email-only dedupe; phone is a hint." },
  { id: "crm.pipeline", area: "CRM", name: "Pipelines, stages, tasks, notes, timeline", status: "tested_fixture", detail: "Separate agency and client pipelines." },
  { id: "crm.booking", area: "CRM", name: "Bookings", status: "manual_fallback", detail: "Manual records only. Not calendar reservations.", next: "Connect a calendar provider (Google Calendar / Cal.com) — needs approval." },
  { id: "crm.proposals", area: "CRM", name: "Versioned proposals + print/PDF export", status: "tested_fixture", detail: "Performance fees stay draft-only until fully specified. No e-signature." },
  { id: "crm.outcomes", area: "CRM", name: "Outcome & payment confirmation", status: "tested_fixture", detail: "Manual; client vs agency vs provider marked separately. No payment processing." },
  { id: "auto.workflows", area: "Automation", name: "Follow-up workflows", status: "tested_fixture", detail: "Finite steps, version snapshots, dispatch-time stop checks, emergency pause." },
  { id: "auto.email", area: "Automation", name: "Sending email (Resend)", status: "implemented", detail: "Adapter built and tested against a mock of Resend's documented API: domain must be verified + DMARC, idempotency key per send, reply-stop line. Off until a key is added and LIVE_SENDING_ENABLED is approved.", next: "Add your sending domain in Resend, paste the key in Settings → Integrations, then approve live sending." },
  { id: "auto.sms", area: "Automation", name: "Sending SMS", status: "deferred", detail: "Not built. SMS steps are held." },
  { id: "setup.clients", area: "Setup", name: "Client workspaces, brand facts review, destinations, stages, workflow builder", status: "tested_fixture", detail: "Agency creates isolated client workspaces; facts from websites or inference always need review." },
  { id: "web.builder", area: "Websites", name: "Section builder, versions, preview, rollback", status: "tested_fixture", detail: "Template generation from approved brand facts (not AI)." },
  { id: "web.forms", area: "Websites", name: "Public lead form → CRM", status: "tested_fixture", detail: "Honeypot, rate limits, same-origin check, idempotency key." },
  { id: "web.deploy", area: "Websites", name: "Custom domain deployment", status: "deferred", detail: "Pages are served by this app at /s/<site>/. HTML export available.", next: "Choose host + domain; approve public deployment." },
  { id: "web.wordpress", area: "Websites", name: "WordPress/Elementor write", status: "deferred", detail: "Existing client sites are not touched." },
  { id: "content.drafts", area: "Content", name: "Briefs, platform variants, branded SVG export", status: "tested_fixture", detail: "Template drafts; sources stored as discovery until verified." },
  { id: "content.approval", area: "Content", name: "Version-bound approval + durable queue", status: "tested_fixture", detail: "Edits revoke approval; worker re-checks; ambiguous results reconcile before retry." },
  { id: "content.publish.dry", area: "Content", name: "Dry-run publishing adapter", status: "tested_fixture", detail: "Simulated, labelled “Dry run — nothing posted”." },
  { id: "content.publish.contentstudio", area: "Content", name: "ContentStudio publishing (text posts: Facebook, LinkedIn, Google Business Profile)", status: "implemented", detail: "Built and tested against a mock of ContentStudio's documented API. Never auto-resends after an unclear result. Images/video not sent yet. Off until a key is added and LIVE_PUBLISHING_ENABLED is approved.", next: "Buy the ContentStudio API plan, paste the key, then approve live publishing." },
  { id: "content.manual", area: "Content", name: "Manual hand-off package + mark as posted", status: "tested_fixture", detail: "Download the exact approved text; record the live link afterwards (labelled as posted by hand)." },
  { id: "content.publish.tiktok", area: "Content", name: "TikTok direct post", status: "blocked", detail: "Unaudited apps can only post privately. Use a provider or manual hand-off." },
  { id: "content.whatsapp", area: "Content", name: "WhatsApp Status / Channels", status: "manual_fallback", detail: "No documented API. Export and post by hand." },
  { id: "seo.crawl", area: "SEO", name: "Bounded crawler + rules", status: "tested_fixture", detail: "Owned sites in-process; external sites via SSRF-guarded fetch (not run against a live site in this build)." },
  { id: "seo.patch", area: "SEO", name: "Reviewable patch → apply → recheck → rollback", status: "tested_fixture", detail: "Owned builder pages only." },
  { id: "seo.gsc", area: "SEO", name: "Search Console data", status: "manual_fallback", detail: "CSV import of Pages/Queries exports with period and source; matched to a site only by its domain. API sync not built.", next: "API sync needs a Google Cloud OAuth client with read-only scope." },
  { id: "seo.ga4", area: "SEO", name: "GA4 ingestion", status: "deferred", detail: "Adapter not built." },
  { id: "seo.ahrefs", area: "SEO", name: "Ahrefs enrichment", status: "deferred", detail: "Paid; API access needs an eligible plan. CSV import is the fallback." },
  { id: "ai.generation", area: "AI", name: "AI drafting and page edits", status: "implemented", detail: "Wired into new posts and page edits with template fallback; budget cap, refusal fallback, schema validation, brand-version cache. Tested against a mock API only; off by default.", next: "Approve a monthly cap and run a 20-draft evaluation." },
  { id: "ops.health", area: "Operations", name: "Health check, retention purge, CI, accessibility audit", status: "tested_fixture", detail: "/api/health; daily purge in the worker; GitHub Actions for growth-os/**; axe WCAG 2.2 AA on 23 screens." },
  { id: "auth.sessions", area: "Security", name: "Sessions, roles, workspace isolation", status: "tested_fixture", detail: "DB sessions re-checked per request; tenant guard on every query." },
  { id: "auth.email", area: "Security", name: "Email delivery for invites and resets", status: "manual_fallback", detail: "Links are shown to the owner to pass on." },
  { id: "billing", area: "Billing", name: "Payments / invoices", status: "deferred", detail: "Out of MVP scope. Use an official provider later; no card handling here." },
];

export const STATUS_LABEL: Record<CapStatus, string> = {
  implemented: "Implemented (untested live)", tested_fixture: "Tested with demo data", sandbox_verified: "Sandbox verified", live_verified: "Live verified",
  manual_fallback: "Manual fallback", blocked: "Blocked", deferred: "Deferred",
};
