export type ReportSchedule = { frequency: "daily" | "weekly" | "monthly" | "annual"; timeZone: string; deliveryHourLocal: number; dayOfWeek: number | null; dayOfMonth: number | null; monthOfYear: number | null };

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const text = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(text("weekday"));
  return { year: Number(text("year")), month: Number(text("month")), day: Number(text("day")), hour: Number(text("hour")), weekday };
}

function calendarDate(year: number, month: number, day: number) { return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10); }

export function nextReportOccurrence(schedule: ReportSchedule, after: Date) {
  const first = new Date(after);
  first.setUTCMinutes(0, 0, 0);
  first.setUTCHours(first.getUTCHours() + 1);
  for (let offset = 0; offset < 24 * 370; offset += 1) {
    const candidate = new Date(first.getTime() + offset * 60 * 60 * 1000);
    const local = localParts(candidate, schedule.timeZone);
    if (local.hour !== schedule.deliveryHourLocal) continue;
    if (schedule.frequency === "weekly" && local.weekday !== schedule.dayOfWeek) continue;
    if ((schedule.frequency === "monthly" || schedule.frequency === "annual") && local.day !== schedule.dayOfMonth) continue;
    if (schedule.frequency === "annual" && local.month !== schedule.monthOfYear) continue;
    return candidate;
  }
  throw new Error("No valid report schedule occurrence was found within one year.");
}

export function reportWindowForOccurrence(frequency: ReportSchedule["frequency"], occurrence: Date, timeZone: string) {
  const local = localParts(occurrence, timeZone);
  const occurrenceDate = calendarDate(local.year, local.month, local.day);
  const previousDay = new Date(`${occurrenceDate}T00:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const to = previousDay.toISOString().slice(0, 10);
  if (frequency === "daily") return { from: to, to };
  if (frequency === "weekly") { const start = new Date(previousDay); start.setUTCDate(start.getUTCDate() - 6); return { from: start.toISOString().slice(0, 10), to }; }
  if (frequency === "monthly") {
    const priorMonth = new Date(Date.UTC(local.year, local.month - 2, 1));
    const end = new Date(Date.UTC(local.year, local.month - 1, 0));
    return { from: priorMonth.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  return { from: `${local.year - 1}-01-01`, to: `${local.year - 1}-12-31` };
}
