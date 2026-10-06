import "server-only";
import postgres from "postgres";
import { ApiError } from "./errors";
import { dbEnv } from "./env";

export type Q = postgres.TransactionSql;

/**
 * Two ways to talk to the database.
 *
 * asUser runs a transaction as role app_user with the caller's id in the JWT claims, so every
 * row level security policy applies. Use it for anything done on a user's behalf.
 *
 * Queries pass the user id explicitly and never call auth.uid() themselves. Row level security
 * compares every row against the claims, so a wrong id returns nothing or is refused.
 *
 * asService runs as the connecting role, which bypasses row level security. Use it only for
 * webhooks, cron jobs, the rate limiter and account deletion.
 */
export interface Db {
  asUser<T>(userId: string, fn: (tx: Q) => Promise<T>): Promise<T>;
  asService<T>(fn: (tx: Q) => Promise<T>): Promise<T>;
}

export function createDb(sql: postgres.Sql): Db {
  return {
    asUser: (userId, fn) =>
      sql.begin(async (tx) => {
        // set_config(..., true) is "local": it lasts for this transaction only.
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true),
                        set_config('role', 'app_user', true)`;
        return fn(tx);
      }) as Promise<never>,
    asService: (fn) => sql.begin((tx) => fn(tx)) as Promise<never>,
  };
}

let shared: Db | undefined;
export function getDb(): Db {
  if (!shared) {
    const { DATABASE_URL } = dbEnv();
    // prepare:false because Supabase's pooler runs in transaction mode, which can't hold prepared statements.
    shared = createDb(postgres(DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20, onnotice: () => {} }));
  }
  return shared;
}

/** Postgres errors carry codes. Turn the ones we raise on purpose into API errors. */
export function mapDbError(e: unknown): never {
  const err = e as { code?: string; hint?: string; constraint_name?: string };
  if (err?.code === "42501") throw new ApiError("NOT_FOUND", "Not found.");
  throw e;
}
