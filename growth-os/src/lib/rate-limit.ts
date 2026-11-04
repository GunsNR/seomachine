import { systemDb } from "./db";

/** Fixed-window counter shared through Postgres. Returns false when over the limit. */
export async function hit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await systemDb.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitCounter" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitCounter"."resetAt" < ${now} THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitCounter"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimitCounter"."resetAt" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}
