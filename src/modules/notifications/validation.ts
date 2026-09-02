import { z } from "zod";

export const notificationActionSchema = z.object({
  action: z.enum(["read", "acknowledge"]),
});
