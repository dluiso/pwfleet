import { z } from "zod";
import { fleetReportFiltersSchema, fleetReportSelectionSchema } from "./validation";

const timezone = z.string().min(1).max(80).refine((value) => { try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; } }, "Enter a valid IANA time zone.");
const selectedFilters = fleetReportSelectionSchema.partial();

export const reportSubscriptionInputSchema = z.object({
  name: z.string().trim().min(3).max(160),
  recipientUserId: z.uuid(),
  frequency: z.enum(["daily", "weekly", "monthly", "annual"]),
  format: z.enum(["pdf", "csv"]),
  timeZone: timezone,
  deliveryHourLocal: z.number().int().min(0).max(23),
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  dayOfMonth: z.number().int().min(1).max(28).nullable(),
  monthOfYear: z.number().int().min(1).max(12).nullable(),
  filters: selectedFilters,
  active: z.boolean(),
  recordVersion: z.number().int().positive().optional(),
}).superRefine((value, context) => {
  if (value.frequency === "weekly" && value.dayOfWeek === null) context.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Weekly schedules require a weekday." });
  if ((value.frequency === "monthly" || value.frequency === "annual") && value.dayOfMonth === null) context.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Monthly and annual schedules require a day." });
  if (value.frequency === "annual" && value.monthOfYear === null) context.addIssue({ code: "custom", path: ["monthOfYear"], message: "Annual schedules require a month." });
});

export const manualReportDeliverySchema = z.object({ recipientUserId: z.uuid(), format: z.enum(["pdf", "csv"]), filters: fleetReportFiltersSchema });
