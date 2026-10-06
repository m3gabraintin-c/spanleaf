import "server-only";
import type { Db } from "./db";
import { MEDIA_BUCKET } from "./media";
import type { AuthAdmin, Storage } from "./storage";

export interface JobResult {
  stats: Record<string, number>;
  errors: string[];
}

/**
 * Runs a job and records it in job_runs. A job that throws is logged as failed. Each job is a sweep
 * that finds whatever is due, so a failed run is simply picked up by the next one.
 */
export async function runJob(db: Db, name: string, fn: () => Promise<JobResult>): Promise<JobResult & { ok: boolean }> {
  const [run] = await db.asService((tx) => tx<{ id: string }[]>`insert into job_runs (job) values (${name}) returning id`);
  let result: JobResult;
  try {
    result = await fn();
  } catch (e) {
    result = { stats: {}, errors: [`${(e as Error).name}: job failed`] };
  }
  const ok = result.errors.length === 0;
  await db.asService(
    (tx) => tx`update job_runs set finished_at = now(), ok = ${ok}, stats = ${tx.json(result.stats)},
               errors = ${tx.json(result.errors.slice(0, 20))} where id = ${run.id}`,
  );
  return { ...result, ok };
}

const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Uploads that never finished, and photos no project uses any more. */
export async function mediaCleanup(db: Db, storage: Storage): Promise<JobResult> {
  const errors: string[] = [];
  let removed = 0;
  const rows = await db.asService(
    (tx) => tx<{ id: string; storage_path: string; thumb_path: string | null }[]>`
      select m.id, m.storage_path, m.thumb_path from media m
      where (m.status = 'pending' and m.created_at < now() - interval '1 day')
         or (m.status = 'ready' and m.created_at < now() - interval '7 days'
             and not exists (select 1 from projects p where p.media_ids @> array[m.id]))
      limit 1000`,
  );
  for (const batch of chunk(rows, 100)) {
    try {
      // Files first. If this throws, the rows stay, and tomorrow's run tries again.
      await storage.remove(MEDIA_BUCKET, batch.flatMap((r) => [r.storage_path, ...(r.thumb_path ? [r.thumb_path] : [])]));
      const ids = batch.map((r) => r.id);
      await db.asService((tx) => tx`delete from media where id = any(${ids}::uuid[])`);
      removed += batch.length;
    } catch {
      errors.push(`media batch of ${batch.length} failed`);
    }
  }
  return { stats: { removed }, errors };
}

/** Empties the trash after 30 days, and tidies tables that only grow. */
export async function trashPurge(db: Db): Promise<JobResult> {
  const purged = await db.asService((tx) => tx`delete from projects where deleted_at < now() - interval '30 days' returning id`);
  const windows = await db.asService((tx) => tx`delete from rate_limits where window_start < now() - interval '1 day' returning key`);
  const runs = await db.asService((tx) => tx`delete from job_runs where started_at < now() - interval '90 days' returning id`);
  return { stats: { projects: purged.length, rateLimitRows: windows.length, jobRuns: runs.length }, errors: [] };
}

/**
 * Finishes account deletions: removes the user's files, then their sign-in record. Everything else
 * (profile, projects, media rows) goes with it through ON DELETE CASCADE.
 */
export async function accountDeletion(db: Db, storage: Storage, authAdmin: AuthAdmin): Promise<JobResult> {
  const errors: string[] = [];
  let deleted = 0;
  const users = await db.asService(
    (tx) => tx<{ id: string }[]>`select id from profiles where deletion_requested_at is not null order by deletion_requested_at limit 20`,
  );
  for (const u of users) {
    try {
      const files = await storage.listFolder(MEDIA_BUCKET, u.id);
      for (const batch of chunk(files, 100)) await storage.remove(MEDIA_BUCKET, batch);
      await authAdmin.deleteUser(u.id);
      deleted++;
    } catch {
      // The profile row is still flagged, so the next run retries this user. Other users carry on.
      errors.push("one account could not be fully deleted yet");
    }
  }
  return { stats: { requested: users.length, deleted }, errors };
}
