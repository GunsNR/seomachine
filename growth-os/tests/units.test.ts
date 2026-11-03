import { describe, it, expect } from "vitest";
import { parseMoney, formatMoney, sumByCurrency, revenueToCostRatio } from "@/lib/money";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { sendBlockers, summarize, type LineItem } from "@/lib/offers";
import { parseCsv, csvCell } from "@/lib/crm/intake";
import { redact } from "@/lib/crypto";
import { contrastRatio, themeIssues } from "@/lib/brand";
import { isBlockedAddress } from "@/lib/net";
import { touchFromRequest, sourceLabel } from "@/lib/attribution";

describe("money (REQ-MEA-04)", () => {
  it("parses into minor units and rejects ambiguity", () => {
    expect(parseMoney("1,250.50", "USD")).toBe(125050);
    expect(parseMoney("900", "USD")).toBe(90000);
    expect(parseMoney("500", "JPY")).toBe(500);
    expect(() => parseMoney("12.345", "USD")).toThrow();
    expect(() => parseMoney("abc", "USD")).toThrow();
  });
  it("never sums across currencies", () => {
    expect(sumByCurrency([{ amountMinor: 100, currency: "USD" }, { amountMinor: 50, currency: "EUR" }, { amountMinor: 1, currency: "USD" }])).toEqual({ USD: 101, EUR: 50 });
  });
  it("revenue-to-cost is unavailable on zero, missing or mixed denominators", () => {
    expect(revenueToCostRatio({ amountMinor: 1000, currency: "USD" }, { amountMinor: 0, currency: "USD" })).toBeNull();
    expect(revenueToCostRatio({ amountMinor: 1000, currency: "USD" }, null)).toBeNull();
    expect(revenueToCostRatio({ amountMinor: 1000, currency: "USD" }, { amountMinor: 500, currency: "EUR" })).toBeNull();
    expect(revenueToCostRatio({ amountMinor: 1000, currency: "USD" }, { amountMinor: 500, currency: "USD" })).toBe(2);
  });
  it("formats with explicit currency", () => {
    expect(formatMoney(125050, "USD")).toBe("$1,250.50");
    expect(formatMoney(null, "USD")).toBe("—");
  });
});

describe("normalization (REQ-CRM-01)", () => {
  it("normalizes email and phone", () => {
    expect(normalizeEmail("  Jo@Example.COM ")).toBe("jo@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizePhone("(732) 555-0100")).toBe("17325550100");
  });
});

describe("offers (REQ-CRM-07)", () => {
  const perf: LineItem = { kind: "performance", label: "Per qualified lead", unitAmountMinor: 5000, unit: "lead", terms: { metric: "qualified leads" } };
  it("keeps incomplete performance terms draft-only", () => {
    const b = sendBlockers([perf]);
    expect(b[0]).toMatch(/baseline/);
    expect(b[0]).toMatch(/capMinor/);
  });
  it("summarizes without counting performance fees as contract value", () => {
    const s = summarize([{ kind: "retainer", label: "SEO", amountMinor: 150000, interval: "month", termMonths: 6 }, { kind: "one_time", label: "Site", amountMinor: 300000 }, perf]);
    expect(s.recurringMonthly).toBe(150000);
    expect(s.termValueExcludingPerformance).toBe(150000 * 6 + 300000);
    expect(s.hasPerformance).toBe(true);
  });
});

describe("csv", () => {
  it("parses quoted fields and guards formula injection", () => {
    const rows = parseCsv('First Name,Email,Notes\n"Ana","ana@x.co","said ""hi"", twice"\r\nBo,bo@x.co,\n');
    expect(rows).toEqual([{ first_name: "Ana", email: "ana@x.co", notes: 'said "hi", twice' }, { first_name: "Bo", email: "bo@x.co", notes: "" }]);
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
});

describe("redaction (REQ-SEC-05)", () => {
  it("removes credential-shaped strings", () => {
    const out = redact("failed: Authorization: Bearer abcdefghijklmnopqrstuv api_key=sk-ant-1234567890abcdef");
    expect(out).not.toMatch(/abcdefghijklmnop/);
    expect(out).not.toMatch(/sk-ant-1234/);
  });
});

describe("theme contrast", () => {
  it("computes WCAG contrast and flags weak themes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(themeIssues({ primary: "#ffcc00", primaryInk: "#ffffff", surface: "#ffffff", ink: "#111111", muted: "#999999", font: "system-sans", radius: "small" }).length).toBe(2);
  });
});

describe("SSRF guard (REQ-SEC-04)", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1", "100.64.0.1"]) expect(isBlockedAddress(ip)).toBe(true);
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
  });
});

describe("attribution (REQ-MEA-02)", () => {
  it("reads UTMs and keeps unknown as unknown", () => {
    const t = touchFromRequest({ landingPage: "https://x.test/a?utm_source=facebook&utm_medium=social&utm_content=post-12" });
    expect([t.source, t.medium, t.content, t.landingPage]).toEqual(["facebook", "social", "post-12", "https://x.test/a"]);
    expect(sourceLabel(touchFromRequest({}))).toBe("Unknown source");
    expect(touchFromRequest({ referrer: "https://www.google.com/" }).source).toBe("google.com");
  });
});
