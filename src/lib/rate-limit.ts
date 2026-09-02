import crypto from "node:crypto";
import net from "node:net";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { requestRateLimits } from "@/db/schema";
import { getEnvironment } from "./env";

export type RateLimitResult = { allowed: boolean; limit: number; remaining: number; retryAfterSeconds: number };

function clientAddress(request: Request): string {
  const env = getEnvironment();
  if (!env.TRUST_PROXY_HEADERS) return "untrusted-proxy";
  const raw = request.headers.get(env.TRUSTED_CLIENT_IP_HEADER);
  const candidate = env.TRUSTED_CLIENT_IP_HEADER === "x-forwarded-for" ? raw?.split(",")[0]?.trim() : raw?.trim();
  return candidate && net.isIP(candidate) ? candidate : "unknown";
}

async function enforceRateLimitKey(key: string, scope: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const env = getEnvironment();
  if (!env.AUTH_SECRET) return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const keyHash = crypto.createHmac("sha256", env.AUTH_SECRET).update(key).digest("hex");
  const [bucket] = await db
    .insert(requestRateLimits)
    .values({ scope, keyHash, windowStart, requestCount: 1 })
    .onConflictDoUpdate({
      target: [requestRateLimits.scope, requestRateLimits.keyHash, requestRateLimits.windowStart],
      set: { requestCount: sql`${requestRateLimits.requestCount} + 1`, updatedAt: new Date() },
    })
    .returning({ count: requestRateLimits.requestCount });
  const count = bucket?.count ?? limit + 1;
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000)),
  };
}

export async function enforceRateLimit(request: Request, scope: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  return enforceRateLimitKey(`ip:${clientAddress(request)}`, scope, limit, windowSeconds);
}

export async function enforceActorRateLimit(actorId: string, scope: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  return enforceRateLimitKey(`actor:${actorId}`, scope, limit, windowSeconds);
}

export async function enforceCredentialRateLimit(credential: string, scope: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  return enforceRateLimitKey(`credential:${credential.trim().toLowerCase()}`, scope, limit, windowSeconds);
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json({ error: "Too many requests. Wait before trying again." }, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(result.retryAfterSeconds),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
    },
  });
}

export async function cleanupRateLimitBuckets(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const deleted = await db.delete(requestRateLimits).where(lt(requestRateLimits.windowStart, cutoff)).returning({ scope: requestRateLimits.scope });
  return deleted.length;
}
