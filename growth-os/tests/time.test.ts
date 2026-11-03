import { describe, it, expect } from "vitest";
import { zonedToUtc, addLocalDays, formatInZone, parseLocalInput, toLocalInput } from "@/lib/time";

const NY = "America/New_York";

describe("scheduling across daylight-saving changes (acceptance 8, REQ-SCH-01)", () => {
  it("converts ordinary local times", () => {
    expect(zonedToUtc({ year: 2026, month: 11, day: 3, hour: 9, minute: 0 }, NY).toISOString()).toBe("2026-11-03T14:00:00.000Z");
    expect(zonedToUtc({ year: 2026, month: 7, day: 1, hour: 9, minute: 0 }, NY).toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });
  it("moves a non-existent spring-forward time forward by the gap (02:30 → 03:30 EDT)", () => {
    const d = zonedToUtc({ year: 2027, month: 3, day: 14, hour: 2, minute: 30 }, NY);
    expect(d.toISOString()).toBe("2027-03-14T07:30:00.000Z");
    expect(formatInZone(d, NY, { weekday: undefined })).toMatch(/3:30 AM EDT/);
  });
  it("resolves an ambiguous fall-back time to the first occurrence (01:30 EDT)", () => {
    const d = zonedToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY);
    expect(d.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("keeps a daily 9am post at 9am local across the change", () => {
    const sat = zonedToUtc({ year: 2026, month: 10, day: 31, hour: 9, minute: 0 }, NY);
    const sun = addLocalDays(sat, 1, NY);
    expect(sat.toISOString()).toBe("2026-10-31T13:00:00.000Z");
    expect(sun.toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(toLocalInput(sun, NY)).toBe("2026-11-01T09:00");
  });
  it("round-trips the datetime-local input and validates zones", () => {
    expect(toLocalInput(parseLocalInput("2026-12-24T16:45", NY), NY)).toBe("2026-12-24T16:45");
    expect(() => zonedToUtc({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 }, "Mars/Olympus")).toThrow();
  });
});
