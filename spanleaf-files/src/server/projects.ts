import "server-only";
import { DocSchema, EMPTY_DOC, mediaIdsOf, type Doc } from "@/lib/doc";
import type { FormatKey } from "@/lib/formats";
import type { Project, ProjectSummary } from "@/data/types";
import { mapDbError, type Db, type Q } from "./db";
import { ApiError, isUuid } from "./errors";

interface Row {
  id: string;
  title: string;
  format: FormatKey;
  slide_count: number;
  doc: Doc;
  rev: number;
  updated_at: string;
}

const summary = (r: Pick<Row, "id" | "title" | "format" | "slide_count" | "updated_at">): ProjectSummary => ({
  id: r.id,
  title: r.title,
  format: r.format,
  slideCount: r.slide_count,
  updatedAt: new Date(r.updated_at).toISOString(),
});
const full = (r: Row): Project => ({ ...summary(r), doc: r.doc, rev: r.rev });

export const requireId = (id: string) => {
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "That project doesn't exist.");
  return id;
};

const isPremium = async (tx: Q) => (await tx<{ p: boolean }[]>`select current_user_is_premium() as p`)[0].p;

/** GET /api/projects. Newest edit first. The cursor keeps the database's own microsecond timestamp. */
export async function listProjects(db: Db, userId: string, input: { cursor?: string; limit: number }) {
  let ts: string | null = null;
  let id: string | null = null;
  if (input.cursor) {
    const [t, i] = Buffer.from(input.cursor, "base64url").toString().split("|");
    if (!t || !i || !isUuid(i) || Number.isNaN(Date.parse(t))) throw new ApiError("INVALID", "That page cursor isn't valid.");
    ts = t;
    id = i;
  }
  const rows = await db.asUser(
    userId,
    (tx) => tx<(Row & { cursor_ts: string })[]>`
      select id, title, format, slide_count, updated_at, updated_at::text as cursor_ts
      from projects
      where deleted_at is null
        -- ::text first: postgres.js would otherwise turn the string into a JS Date and cut the
        -- timestamp to milliseconds, which skips rows that share a timestamp.
        and (${ts}::text is null or (updated_at, id) < (${ts}::text::timestamptz, ${id}::uuid))
      order by updated_at desc, id desc
      limit ${input.limit + 1}`,
  );
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(summary),
    next: rows.length > input.limit && last ? Buffer.from(`${last.cursor_ts}|${last.id}`).toString("base64url") : null,
  };
}

/** POST /api/projects. Blank, or copied from a template the caller is allowed to open. */
export async function createProject(
  db: Db,
  userId: string,
  input: { format?: string; slideCount?: number; title?: string; templateId?: string },
): Promise<Project> {
  return db.asUser(userId, async (tx) => {
    let doc: Doc = EMPTY_DOC;
    let format = (input.format ?? "portrait_4_5") as FormatKey;
    let slideCount = input.slideCount ?? 3;
    let templateId: string | null = null;

    if (input.templateId) {
      // templates is readable by anyone signed in. template_docs is filtered by row level security,
      // so a premium template's document only comes back for a premium user.
      const [t] = await tx<{ id: string; format: FormatKey; slide_count: number }[]>`
        select id, format, slide_count from templates where id = ${input.templateId}`;
      if (!t) throw new ApiError("NOT_FOUND", "That template doesn't exist.");
      const [d] = await tx<{ doc: unknown }[]>`select doc from template_docs where template_id = ${t.id}`;
      if (!d) throw new ApiError("PREMIUM_REQUIRED", "That template needs Premium.");
      const parsed = DocSchema.safeParse(d.doc);
      if (!parsed.success) throw new ApiError("INTERNAL", "That template is damaged.");
      doc = parsed.data;
      format = t.format;
      slideCount = t.slide_count;
      templateId = t.id;
    }

    try {
      const [row] = await tx<Row[]>`
        insert into projects (user_id, title, format, slide_count, doc, source_template_id)
        values (${userId}, ${input.title?.trim() || "Untitled"}, ${format}, ${slideCount},
                ${tx.json(doc)}, ${templateId})
        returning id, title, format, slide_count, doc, rev, updated_at`;
      return full(row);
    } catch (e) {
      return mapDbError(e);
    }
  });
}

/** GET /api/projects/:id */
export async function getProject(db: Db, userId: string, id: string): Promise<Project> {
  requireId(id);
  const [row] = await db.asUser(
    userId,
    (tx) => tx<Row[]>`select id, title, format, slide_count, doc, rev, updated_at from projects where id = ${id} and deleted_at is null`,
  );
  if (!row) throw new ApiError("NOT_FOUND", "That project doesn't exist.");
  return full(row);
}

export interface PatchInput {
  rev: number;
  doc?: Doc;
  title?: string;
  format?: string;
  slideCount?: number;
}

/**
 * PATCH /api/projects/:id. The autosave. One conditional UPDATE that only succeeds if rev still
 * matches, so a stale tab gets a conflict instead of overwriting newer work.
 */
export async function patchProject(db: Db, userId: string, id: string, input: PatchInput): Promise<{ rev: number }> {
  requireId(id);
  return db.asUser(userId, async (tx) => {
    let mediaIds: string[] | null = null;
    if (input.doc) {
      if (input.doc.elements.some((e) => e.type === "video") && !(await isPremium(tx))) {
        throw new ApiError("PREMIUM_REQUIRED", "Video layers need Premium.");
      }
      mediaIds = mediaIdsOf(input.doc);
      if (mediaIds.some((m) => !isUuid(m))) throw new ApiError("INVALID", "The project refers to a photo that doesn't exist.");
      if (mediaIds.length) {
        // Row level security only returns the caller's own rows, so a foreign id comes back missing.
        const owned = await tx<{ id: string }[]>`select id from media where id = any(${mediaIds}::uuid[]) and status = 'ready'`;
        if (owned.length !== mediaIds.length) throw new ApiError("INVALID", "The project refers to a photo that isn't yours or isn't ready.");
      }
    }

    let rows: { rev: number }[];
    try {
      rows = await tx<{ rev: number }[]>`
        update projects set
          doc = coalesce(${input.doc ? tx.json(input.doc) : null}::jsonb, doc),
          media_ids = coalesce(${mediaIds ? `{${mediaIds.join(",")}}` : null}::uuid[], media_ids),
          title = coalesce(${input.title ? input.title : null}, title),
          format = coalesce(${input.format ?? null}, format),
          slide_count = coalesce(${input.slideCount ?? null}::smallint, slide_count),
          rev = rev + 1
        where id = ${id} and rev = ${input.rev} and deleted_at is null
        returning rev`;
    } catch (e) {
      return mapDbError(e);
    }
    if (rows.length === 1) return { rev: rows[0].rev };

    // No row updated: either it isn't there, or someone saved first.
    const [exists] = await tx<{ rev: number }[]>`select rev from projects where id = ${id} and deleted_at is null`;
    if (!exists) throw new ApiError("NOT_FOUND", "That project doesn't exist.");
    throw new ApiError("REV_CONFLICT", "This project was changed somewhere else.");
  });
}

/** POST /api/projects/:id/duplicate */
export async function duplicateProject(db: Db, userId: string, id: string): Promise<Project> {
  requireId(id);
  return db.asUser(userId, async (tx) => {
    try {
      const [row] = await tx<Row[]>`
        insert into projects (user_id, title, format, slide_count, doc, media_ids, source_template_id)
        select user_id, left(title, 74) || ' copy', format, slide_count, doc, media_ids, source_template_id
        from projects where id = ${id} and deleted_at is null
        returning id, title, format, slide_count, doc, rev, updated_at`;
      if (!row) throw new ApiError("NOT_FOUND", "That project doesn't exist.");
      return full(row);
    } catch (e) {
      return mapDbError(e);
    }
  });
}

/** DELETE /api/projects/:id. Moves it to the trash. The purge job removes it after 30 days. */
export async function trashProject(db: Db, userId: string, id: string): Promise<void> {
  requireId(id);
  const rows = await db.asUser(userId, (tx) => tx`update projects set deleted_at = now() where id = ${id} and deleted_at is null returning id`);
  if (rows.length === 0) throw new ApiError("NOT_FOUND", "That project doesn't exist.");
}

/** POST /api/projects/:id/restore */
export async function restoreProject(db: Db, userId: string, id: string): Promise<void> {
  requireId(id);
  const rows = await db.asUser(
    userId,
    (tx) => tx`update projects set deleted_at = null
               where id = ${id} and deleted_at is not null and deleted_at > now() - interval '30 days' returning id`,
  );
  if (rows.length === 0) throw new ApiError("NOT_FOUND", "That project can't be restored.");
}
