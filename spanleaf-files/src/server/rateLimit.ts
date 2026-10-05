import "server-only";
import type { Db } from "./db";
import { ApiError } from "./errors";

/**
 * Fixed-window counter kept in Postgres, so it works across serverless instances with no extra
 * service. Swap for Upstash later if the write per request ever matters.
 * Auth emails are limited by Supabase Auth itself.
 */
export async function rateLimit(db: Db, name: string, userId: string, max: number, windowSec: number): Promise<void> {
  const key = `${name}:${userId}`;
  const [row] = await db.asService(
    (tx) => tx<{ count: number; reset_in: number }[]>`
      insert into rate_limits (key, window_start, count)
      values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}) * ${windowSec}), 1)
      on conflict (key, window_start) do update set count = rate_limits.count + 1
      returning count,
        ceil(${windowSec} - (extract(epoch from now()) - extract(epoch from window_start)))::int as reset_in`,
  );
  if (row.count > max) throw new ApiError("RATE_LIMITED", "Too many requests. Try again shortly.", { retryAfter: Math.max(1, row.reset_in) });
}
