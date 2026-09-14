import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Upstash Redis rate limiting (CLAUDE.md §1) — protects public endpoints
 * (lead intake, login) from spam and credential stuffing.
 *
 * Sliding-window limits, keyed by client IP (Cloudflare's cf-connecting-ip
 * when present). Fails CLOSED for lead intake abuse but degrades open if
 * Redis itself is unreachable, so an Upstash outage never takes down lead
 * capture — adjust `failOpen` per endpoint sensitivity.
 */

const redis = Redis.fromEnv(); // UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

export const leadIntakeLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 submissions/min/IP
  prefix: "rl:lead",
});

export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "5 m"), // 10 attempts / 5 min / IP
  prefix: "rl:login",
});

export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function checkLimit(
  limiter: Ratelimit,
  key: string,
  { failOpen = true }: { failOpen?: boolean } = {}
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  try {
    const res = await limiter.limit(key);
    return {
      allowed: res.success,
      retryAfterSeconds: res.success ? undefined : Math.ceil((res.reset - Date.now()) / 1000),
    };
  } catch {
    // Redis unreachable — availability choice per endpoint.
    return { allowed: failOpen };
  }
}
