import { describe, it, expect, beforeEach } from "vitest";
import { db, systemDb } from "@/lib/db";
import { resetDb, makeWorkspace, makeBrand } from "./helpers";
import { addDestination, addFact, createClientWorkspace, reviewFact, saveWorkflow, updateStages, initialReview } from "@/lib/setup";
import { BrandProfileSchema, approvedFacts } from "@/lib/brand";
import { parseStages } from "@/lib/crm/pipelines";
import { intakeLead } from "@/lib/crm/intake";
import { touch } from "./helpers";

beforeEach(resetDb);

describe("client onboarding (REQ-SET-01)", () => {
  it("creates an isolated client workspace with nothing published or switched on", async () => {
    const A = await makeWorkspace("agency");
    const ws = await createClientWorkspace(A.actor, { name: "Coastal Ortho", businessName: "Coastal Orthodontics", industry: "healthcare", timezone: "America/New_York", currency: "USD", serviceAreas: ["Plantation"] });
    expect(ws.parentId).toBe(A.ws.id);
    expect(await systemDb.membership.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect((await db.page.findFirstOrThrow({ where: { workspaceId: ws.id } })).publishedVersion).toBeNull();
    expect((await db.workflow.findFirstOrThrow({ where: { workspaceId: ws.id } })).enabled).toBe(false);
    const p = BrandProfileSchema.parse((await db.brandVersion.findFirstOrThrow({ where: { workspaceId: ws.id } })).profile);
    expect(approvedFacts(p)).toHaveLength(0);
  });

  it("only agency owners/admins, from the agency workspace", async () => {
    const C = await makeWorkspace("client");
    await expect(createClientWorkspace(C.actor, { name: "X Co", businessName: "X Co", industry: "other", timezone: "America/New_York", currency: "USD", serviceAreas: [] })).rejects.toThrow(/agency workspace/);
    const M = await makeWorkspace("agency", "member");
    await expect(createClientWorkspace(M.actor, { name: "X Co", businessName: "X Co", industry: "other", timezone: "America/New_York", currency: "USD", serviceAreas: [] })).rejects.toThrow(/owners and admins/);
  });
});

describe("brand facts (REQ-CON-01)", () => {
  it("website and inferred facts always start in review; approval creates a new version", async () => {
    const W = await makeWorkspace();
    const { brand } = await makeBrand(W.ws.id, W.user.id);
    expect(initialReview("website", true)).toBe("needs_review");
    expect(initialReview("client_supplied", true)).toBe("approved");
    const v2 = await addFact(W.actor, brand.id, { kind: "statistic", text: "Serves 500 homes a year", source: "old site", provenance: "website", attribution: "" }, true);
    const fact = BrandProfileSchema.parse(v2.profile).facts.find((f) => f.text.includes("500"))!;
    expect(fact.review).toBe("needs_review");
    const v3 = await reviewFact(W.actor, brand.id, fact.id, "approved");
    expect(v3.version).toBe(v2.version + 1);
    expect(approvedFacts(BrandProfileSchema.parse(v3.profile)).some((f) => f.id === fact.id)).toBe(true);
  });

  it("testimonials need attribution", async () => {
    const W = await makeWorkspace();
    const { brand } = await makeBrand(W.ws.id, W.user.id);
    await expect(addFact(W.actor, brand.id, { kind: "testimonial", text: "Great work", source: "Google", provenance: "client_supplied", attribution: "" }, true)).rejects.toThrow(/who said it/);
  });
});

describe("destinations are never fake-connected (REQ-CON-07)", () => {
  it("dry run only in demo workspaces; ContentStudio only when connected", async () => {
    const W = await makeWorkspace();
    await systemDb.workspace.update({ where: { id: W.ws.id }, data: { isFixture: false } });
    const { brand } = await makeBrand(W.ws.id, W.user.id);
    await expect(addDestination(W.actor, { brandId: brand.id, platform: "linkedin", label: "LI", adapter: "dry_run" })).rejects.toThrow(/demo workspaces/);
    await expect(addDestination(W.actor, { brandId: brand.id, platform: "linkedin", label: "LI", adapter: "contentstudio", providerAccountId: "1" })).rejects.toThrow(/Connect ContentStudio/);
    const d = await addDestination(W.actor, { brandId: brand.id, platform: "linkedin", label: "LI", adapter: "manual" });
    expect(d.status).toBe("manual_handoff");
  });
});

describe("pipeline stages (REQ-CRM-04)", () => {
  it("keeps one won and one lost, and refuses to remove a stage that holds deals", async () => {
    const W = await makeWorkspace();
    const p = await db.pipeline.findFirstOrThrow({ where: { workspaceId: W.ws.id } });
    const stages = parseStages(p.stages);
    await intakeLead({ workspaceId: W.ws.id, formKey: "f", idempotencyKey: "k", input: { email: "a@example.test", message: "m" }, touch: touch(), channel: "form" });
    await expect(updateStages(W.actor, p.id, stages.filter((s) => s.id !== "new"))).rejects.toThrow(/still has 1 deal/);
    await expect(updateStages(W.actor, p.id, stages.filter((s) => s.type !== "won"))).rejects.toThrow(/exactly one Won/);
    await updateStages(W.actor, p.id, stages.map((s) => (s.id === "contacted" ? { ...s, name: "Called back" } : s)));
    expect(parseStages((await db.pipeline.findFirstOrThrow({ where: { workspaceId: W.ws.id } })).stages).find((s) => s.id === "contacted")?.name).toBe("Called back");
  });
});

describe("workflow builder (REQ-AUT-01)", () => {
  it("creates switched off, versions on save, and rejects foreign assignees", async () => {
    const W = await makeWorkspace();
    const w = await saveWorkflow(W.actor, { name: "Nurture", trigger: "form_submitted", definition: { steps: [{ type: "wait", minutes: 60 }], stopOn: ["reply", "opt_out"], filter: {} } });
    expect(w.enabled).toBe(false);
    const w2 = await saveWorkflow(W.actor, { workflowId: w.id, name: "Nurture", trigger: "form_submitted", definition: { steps: [{ type: "wait", minutes: 120 }], stopOn: ["opt_out"], filter: {} } });
    expect(w2.currentVersion).toBe(2);
    const other = await makeWorkspace();
    await expect(saveWorkflow(W.actor, { name: "x", trigger: "form_submitted", definition: { steps: [{ type: "assign_owner", userId: other.user.id }], stopOn: [], filter: {} } })).rejects.toThrow(/current member/);
  });
});
