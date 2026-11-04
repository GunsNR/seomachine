import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { db, systemDb } from "@/lib/db";
import { resetDb, makeWorkspace, makeBrand, profile } from "./helpers";
import { generateStructured, aiStatus } from "@/lib/ai/provider";
import { hashOf } from "@/lib/crypto";
import { templateVariants } from "@/lib/content/templates";

beforeEach(resetDb);
const Schema = z.object({ caption: z.string() });

describe("acceptance 11 — brand switches never leak cached AI output (REQ-AI-03)", () => {
  it("cache entries are bound to the brand version that produced them", async () => {
    const W = await makeWorkspace();
    const A = await makeBrand(W.ws.id, W.user.id, profile("Brand A"));
    const B = await makeBrand(W.ws.id, W.user.id, profile("Brand B"));
    const args = { workspaceId: W.ws.id, promptVersion: "caption@1", operation: "caption", system: "s", instruction: "write", schema: Schema, jsonSchema: {} };
    const key = hashOf({ w: W.ws.id, b: A.version.id, p: "caption@1", i: "write", s: [], m: aiStatus().model });
    await db.aiCache.create({ data: { key, workspaceId: W.ws.id, brandVersionId: A.version.id, promptVersion: "caption@1", output: { caption: "Brand A only" } } });
    const a = await generateStructured({ ...args, brandVersionId: A.version.id });
    expect(a).toMatchObject({ ok: true, cached: true, output: { caption: "Brand A only" } });
    const b = await generateStructured({ ...args, brandVersionId: B.version.id });
    expect(b.ok).toBe(false); // no cross-brand hit; AI is off, so a truthful disabled state
    if (!b.ok) expect(b.state).toBe("disabled");
  });
});

describe("acceptance 9 — budgets and unavailable AI are recoverable states", () => {
  it("reports AI as off by default with a reason", () => {
    expect(aiStatus().live).toBe(false);
    expect(aiStatus().reason).toMatch(/switched off/);
  });
  it("refuses paid work when the monthly cap is exhausted", async () => {
    process.env.AI_LIVE_ENABLED = "true";
    process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";
    try {
      const W = await makeWorkspace();
      const A = await makeBrand(W.ws.id, W.user.id);
      await systemDb.workspace.update({ where: { id: W.ws.id }, data: { aiMonthlyCapMicros: 1000 } });
      await db.usageEvent.create({ data: { workspaceId: W.ws.id, provider: "anthropic", operation: "x", costMicros: 1000 } });
      const r = await generateStructured({ workspaceId: W.ws.id, brandVersionId: A.version.id, promptVersion: "p", operation: "x", system: "s", instruction: "i", schema: Schema, jsonSchema: {} });
      expect(r).toMatchObject({ ok: false, state: "budget_exhausted" });
    } finally {
      process.env.AI_LIVE_ENABLED = "false";
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});

describe("templates use approved facts only and honour prohibited claims (REQ-CON-02)", () => {
  it("never uses unreviewed facts", () => {
    const p = profile();
    const out = templateVariants(p, { objective: "leads", audienceQuestion: "Why is my water heater making noise", cta: "Book a visit", destinationUrl: "https://example.test/wh", contentKey: "c1", campaignKey: "fall" }, ["linkedin", "instagram"]);
    const all = JSON.stringify(out);
    expect(all).not.toContain("99%");
    expect(out.variants[0]!.caption).toContain("utm_content=c1");
    expect(out.blocked).toEqual([]);
  });
  it("blocks output containing a prohibited claim", () => {
    const p = profile("X", { prohibitedClaims: ["Book a visit"] });
    const out = templateVariants(p, { objective: "", audienceQuestion: "Q", cta: "Book a visit", destinationUrl: "https://e.test", contentKey: "c", campaignKey: "k" }, ["linkedin"]);
    expect(out.blocked.length).toBeGreaterThan(0);
  });
});
