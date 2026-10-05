import "server-only";
import type { Db } from "./db";
import { ApiError, isUuid } from "./errors";

const publicUrl = (base: string, bucket: string, path: string | null) =>
  path ? `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}` : null;

/**
 * GET /api/templates. Lists every published template, premium ones included, so a free user sees a
 * lock badge. The documents themselves are behind row level security (see createProject).
 */
export async function listTemplates(
  db: Db,
  userId: string,
  input: { style?: string; format?: string; cursor?: string; limit: number },
  publicBase: string,
) {
  let order: number | null = null;
  let id: string | null = null;
  if (input.cursor) {
    const [o, i] = Buffer.from(input.cursor, "base64url").toString().split("|");
    if (!i || !isUuid(i) || !/^-?\d+$/.test(o ?? "")) throw new ApiError("INVALID", "That page cursor isn't valid.");
    order = Number(o);
    id = i;
  }
  const rows = await db.asUser(
    userId,
    (tx) => tx<
      { id: string; slug: string; title: string; style_tag: string; format: string; slide_count: number; is_premium: boolean; thumbnail_path: string | null; sort_order: number }[]
    >`
      select id, slug, title, style_tag, format, slide_count, is_premium, thumbnail_path, sort_order
      from templates
      where (${input.style ?? null}::text is null or style_tag = ${input.style ?? null})
        and (${input.format ?? null}::text is null or format = ${input.format ?? null})
        and (${order}::int is null or (sort_order, id) > (${order}::int, ${id}::uuid))
      order by sort_order, id
      limit ${input.limit + 1}`,
  );
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      styleTag: r.style_tag,
      format: r.format,
      slideCount: r.slide_count,
      isPremium: r.is_premium,
      thumbnailUrl: publicUrl(publicBase, "templates", r.thumbnail_path),
    })),
    next: rows.length > input.limit && last ? Buffer.from(`${last.sort_order}|${last.id}`).toString("base64url") : null,
  };
}

/** GET /api/assets */
export async function listAssets(db: Db, userId: string, input: { kind: string; category?: string }, publicBase: string) {
  const rows = await db.asUser(
    userId,
    (tx) => tx<{ id: string; kind: string; name: string; category: string; storage_path: string }[]>`
      select id, kind, name, category, storage_path from assets
      where kind = ${input.kind} and (${input.category ?? null}::text is null or category = ${input.category ?? null})
      order by category, name
      limit 200`,
  );
  return {
    items: rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, category: r.category, url: publicUrl(publicBase, "assets", r.storage_path) })),
  };
}
