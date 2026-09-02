function wallParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

export function zonedStartOfDay(dateValue: string, timeZone: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid calendar date.");
  const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = new Date(targetAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = wallParts(candidate, timeZone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    candidate = new Date(candidate.getTime() + targetAsUtc - shownAsUtc);
  }
  return candidate;
}

export function addCalendarDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}
