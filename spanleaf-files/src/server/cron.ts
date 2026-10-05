import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "./db";
import { cronEnv } from "./env";
import { runJob, type JobResult } from "./jobs";

function authorised(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronEnv().CRON_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on its own when CRON_SECRET is set. */
export function cronRoute(name: string, job: () => Promise<JobResult>) {
  return async (req: Request): Promise<Response> => {
    try {
      if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
      const result = await runJob(getDb(), name, job);
      return NextResponse.json({ job: name, ok: result.ok, stats: result.stats, errorCount: result.errors.length }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      console.error("cron_failed", { job: name, name: (e as Error).name });
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }
  };
}
