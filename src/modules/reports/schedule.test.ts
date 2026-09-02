import { describe, expect, it } from "vitest";
import { nextReportOccurrence, reportWindowForOccurrence } from "./schedule";

describe("report scheduling", () => {
  it("keeps the configured Chicago hour across daylight-saving time", () => {
    const schedule = { frequency: "daily" as const, timeZone: "America/Chicago", deliveryHourLocal: 6, dayOfWeek: null, dayOfMonth: null, monthOfYear: null };
    expect(nextReportOccurrence(schedule, new Date("2026-03-07T20:00:00Z")).toISOString()).toBe("2026-03-08T11:00:00.000Z");
  });
  it("derives closed reporting windows", () => {
    expect(reportWindowForOccurrence("weekly", new Date("2026-09-07T11:00:00Z"), "America/Chicago")).toEqual({ from: "2026-08-31", to: "2026-09-06" });
    expect(reportWindowForOccurrence("monthly", new Date("2026-09-01T11:00:00Z"), "America/Chicago")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
});
