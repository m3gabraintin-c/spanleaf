import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getUser, type SessionUser } from "./auth";
import { getDb, type Db } from "./db";
import { ApiError } from "./errors";
import { rateLimit } from "./rateLimit";

const MAX_BODY = 3 * 1024 * 1024;

interface UserCtx<I> {
  user: SessionUser;
  input: I;
  db: Db;
  params: Record<string, string>;
  req: Request;
}

type RouteCtx = { params?: Promise<Record<string, string>> };

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

function errorResponse(e: unknown, route: string, requestId: string) {
  if (e instanceof ApiError) {
    return json({ error: { code: e.code, message: e.message } }, e.status, e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {});
  }
  // Log the kind of failure only. Messages can contain user data (an email in a constraint error, say).
  const err = e as { name?: string; code?: string; constraint_name?: string };
  console.error("api_error", { route, requestId, name: err?.name, pg: err?.code, constraint: err?.constraint_name });
  return json({ error: { code: "INTERNAL", message: "Something went wrong. Try again." } }, 500, { "x-request-id": requestId });
}

async function readInput(req: Request, schema: z.ZodTypeAny | undefined) {
  if (!schema) return undefined;
  let raw: unknown = {};
  if (req.method === "GET" || req.method === "HEAD") {
    raw = Object.fromEntries(new URL(req.url).searchParams);
  } else {
    const text = await req.text();
    if (text.length > MAX_BODY) throw new ApiError("INVALID", "That request is too large.");
    if (text.length > 0) {
      try {
        raw = JSON.parse(text);
      } catch {
        throw new ApiError("INVALID", "The request body isn't valid JSON.");
      }
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Name the fields that failed, never echo the values back.
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "body"))].join(", ");
    throw new ApiError("INVALID", `Check these fields: ${fields}.`);
  }
  return parsed.data;
}

interface RouteDeps {
  getUser: () => Promise<SessionUser | null>;
  getDb: () => Db;
}

/**
 * Builds the route wrapper from its dependencies. Production uses userRoute below. Tests build their own
 * with a fixed user and a test database, and run the same wrapper code.
 */
export function makeUserRoute(deps: RouteDeps) {
  return function userRoute<S extends z.ZodTypeAny | undefined = undefined>(
    opts: { name: string; input?: S; limit?: { max: number; windowSec: number }; allowDeleting?: boolean },
    handler: (ctx: UserCtx<S extends z.ZodTypeAny ? z.infer<S> : undefined>) => Promise<unknown>,
  ) {
    return async (req: Request, routeCtx?: RouteCtx): Promise<Response> => {
      const requestId = randomUUID();
      try {
        const user = await deps.getUser();
        if (!user) throw new ApiError("UNAUTHENTICATED", "Sign in first.");
        const db = deps.getDb();

        // One round trip: make sure the profile row exists, and see whether deletion was requested.
        const [p] = await db.asService(
          (tx) => tx<{ deletion_requested_at: string | null }[]>`
            with ins as (insert into profiles (id) values (${user.id}) on conflict do nothing)
            select deletion_requested_at from profiles where id = ${user.id}`,
        );
        if (p?.deletion_requested_at && !opts.allowDeleting) throw new ApiError("ACCOUNT_DELETING", "This account is being deleted.");

        if (opts.limit) await rateLimit(db, opts.name, user.id, opts.limit.max, opts.limit.windowSec);

        const input = (await readInput(req, opts.input)) as never;
        const params = (await routeCtx?.params) ?? {};
        const result = await handler({ user, input, db, params, req });
        return json(result ?? { ok: true }, 200);
      } catch (e) {
        return errorResponse(e, opts.name, requestId);
      }
    };
  };
}

/** Wraps a route for a signed-in user: authenticates, refuses accounts that are being deleted, rate limits, validates input with zod, and turns errors into the one error shape. */
export const userRoute = makeUserRoute({ getUser, getDb });
