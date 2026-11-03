import { describe, it, expect } from "vitest";
import { assertTenantArgs, db, TENANT_MODELS, TenantScopeError } from "@/lib/db";

describe("tenant guard (REQ-SEC-01)", () => {
  it("covers every tenant-owned model", () => {
    for (const m of ["Contact", "Opportunity", "Payment", "ContentPiece", "Approval", "Publication", "Page", "PageVersion", "SeoFinding", "AiCache", "UsageEvent"]) expect(TENANT_MODELS.has(m)).toBe(true);
    expect(TENANT_MODELS.has("User")).toBe(false);
  });
  it("refuses reads, updates and deletes without workspaceId", () => {
    expect(() => assertTenantArgs("Contact", "findMany", {})).toThrow(TenantScopeError);
    expect(() => assertTenantArgs("Contact", "findFirst", { where: { id: "x" } })).toThrow(TenantScopeError);
    expect(() => assertTenantArgs("Payment", "updateMany", { where: { id: "x" }, data: {} })).toThrow(TenantScopeError);
    expect(() => assertTenantArgs("Opportunity", "delete", { where: { id: "x" } })).toThrow(TenantScopeError);
    expect(() => assertTenantArgs("Contact", "create", { data: { firstName: "a" } })).toThrow(TenantScopeError);
    expect(() => assertTenantArgs("Contact", "findMany", { where: { workspaceId: { in: [] } } })).toThrow(TenantScopeError);
  });
  it("allows scoped queries and compound unique keys", () => {
    expect(() => assertTenantArgs("Contact", "findMany", { where: { workspaceId: "w1" } })).not.toThrow();
    expect(() => assertTenantArgs("Contact", "findUnique", { where: { workspaceId_emailNormalized: { workspaceId: "w1", emailNormalized: "a@b.co" } } })).not.toThrow();
    expect(() => assertTenantArgs("Contact", "createMany", { data: [{ workspaceId: "w1" }, { workspaceId: "w1" }] })).not.toThrow();
  });
  it("is enforced by the real client before reaching the database", async () => {
    await expect(db.contact.findMany({})).rejects.toThrow(TenantScopeError);
  });
});
