import "server-only";
import { randomUUID } from "node:crypto";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/formats";
import type { MediaUrls } from "@/data/types";
import type { Db, Q } from "./db";
import { ApiError, isUuid } from "./errors";
import type { Storage } from "./storage";

export const MEDIA_BUCKET = "media";
const GB = 1024 ** 3;
const QUOTA = { free: 2 * GB, premium: 20 * GB };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

interface MediaRow {
  id: string;
  status: "pending" | "ready";
  storage_path: string;
  thumb_path: string | null;
  mime_type: string;
  bytes: string | number;
  width: number | null;
  height: number | null;
}

/** POST /api/media/upload-url. Checks the file's declared type, size and the caller's storage quota. */
export async function createUploadUrl(
  deps: { db: Db; storage: Storage },
  userId: string,
  input: { kind: "image"; mime: string; bytes: number; width: number; height: number },
) {
  const ext = EXT[input.mime];
  if (!ext || !ACCEPTED_IMAGE_TYPES.includes(input.mime)) throw new ApiError("UNSUPPORTED_FILE", "That file type isn't supported.");
  if (input.bytes > MAX_UPLOAD_BYTES) throw new ApiError("FILE_TOO_LARGE", "That image is over 25 MB.");

  const row = await deps.db.asUser(userId, async (tx) => {
    const [{ used, premium }] = await tx<{ used: string; premium: boolean }[]>`
      select coalesce(sum(bytes), 0)::text as used, current_user_is_premium() as premium from media`;
    const cap = premium ? QUOTA.premium : QUOTA.free;
    if (Number(used) + input.bytes > cap) throw new ApiError("LIMIT_REACHED", "You've used all of your storage. Delete some photos first.");
    // The id and paths are built here from the caller's id. They never come from the client, and the
    // media_path_in_owner_folder constraint rejects any path outside the caller's folder.
    const id = randomUUID();
    const path = `${userId}/${id}.${ext}`;
    const thumb = `${userId}/${id}.thumb.${ext}`;
    await tx`
      insert into media (id, user_id, kind, status, storage_path, thumb_path, mime_type, bytes, width, height)
      values (${id}, ${userId}, 'image', 'pending', ${path}, ${thumb}, ${input.mime}, ${input.bytes}, ${input.width}, ${input.height})`;
    return { id, path, thumb };
  });

  try {
    const [main, thumb] = await Promise.all([
      deps.storage.createSignedUploadUrl(MEDIA_BUCKET, row.path),
      deps.storage.createSignedUploadUrl(MEDIA_BUCKET, row.thumb),
    ]);
    return {
      mediaId: row.id,
      upload: { path: main.path, token: main.token, url: main.signedUrl },
      thumbUpload: { path: thumb.path, token: thumb.token, url: thumb.signedUrl },
    };
  } catch (e) {
    await deps.db.asUser(userId, (tx) => tx`delete from media where id = ${row.id}`);
    throw e;
  }
}

/** POST /api/media/:id/complete. Confirms the file really arrived, and is what it claimed to be. */
export async function completeUpload(deps: { db: Db; storage: Storage }, userId: string, id: string) {
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "That photo doesn't exist.");
  const [row] = await deps.db.asUser(
    userId,
    (tx) => tx<MediaRow[]>`select id, status, storage_path, thumb_path, mime_type, bytes, width, height from media where id = ${id}`,
  );
  if (!row) throw new ApiError("NOT_FOUND", "That photo doesn't exist.");
  const record = (r: MediaRow, bytes: number) => ({
    id: r.id,
    kind: "image" as const,
    mimeType: r.mime_type,
    bytes,
    width: r.width ?? 0,
    height: r.height ?? 0,
  });
  if (row.status === "ready") return record(row, Number(row.bytes)); // safe to call twice

  const main = await deps.storage.stat(MEDIA_BUCKET, row.storage_path);
  if (!main) throw new ApiError("UPLOAD_MISSING", "The upload didn't arrive. Try again.");

  const reject = async (code: "FILE_TOO_LARGE" | "UNSUPPORTED_FILE", message: string) => {
    await deps.storage.remove(MEDIA_BUCKET, [row.storage_path, ...(row.thumb_path ? [row.thumb_path] : [])]);
    await deps.db.asUser(userId, (tx) => tx`delete from media where id = ${row.id}`);
    throw new ApiError(code, message);
  };
  if (main.size > MAX_UPLOAD_BYTES) return reject("FILE_TOO_LARGE", "That image is over 25 MB.");
  if (!ACCEPTED_IMAGE_TYPES.includes(main.mimeType)) return reject("UNSUPPORTED_FILE", "That file type isn't supported.");

  const thumb = row.thumb_path ? await deps.storage.stat(MEDIA_BUCKET, row.thumb_path) : null;
  await deps.db.asUser(
    userId,
    (tx) => tx`update media set status = 'ready', bytes = ${main.size}, thumb_path = ${thumb ? row.thumb_path : null} where id = ${row.id}`,
  );
  return record(row, main.size);
}

/** POST /api/media/urls. Short-lived signed URLs, only for the caller's own ready photos. */
export async function getMediaUrls(deps: { db: Db; storage: Storage }, userId: string, ids: string[]): Promise<Record<string, MediaUrls>> {
  const rows = await deps.db.asUser(
    userId,
    (tx) => tx<MediaRow[]>`select id, status, storage_path, thumb_path, mime_type, bytes, width, height
                           from media where id = any(${ids}::uuid[]) and status = 'ready'`,
  );
  if (rows.length === 0) return {};
  const paths = rows.flatMap((r) => [r.storage_path, ...(r.thumb_path ? [r.thumb_path] : [])]);
  const signed = await deps.storage.createSignedUrls(MEDIA_BUCKET, paths, 3600);
  const out: Record<string, MediaUrls> = {};
  for (const r of rows) {
    const url = signed[r.storage_path];
    if (!url) continue;
    out[r.id] = { url, thumbUrl: (r.thumb_path && signed[r.thumb_path]) || url };
  }
  return out;
}

/** DELETE /api/media/:id. Refuses while a project (including one in the trash) still uses it. */
export async function deleteMedia(deps: { db: Db; storage: Storage }, userId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "That photo doesn't exist.");
  const row = await deps.db.asUser(userId, async (tx: Q) => {
    const [r] = await tx<MediaRow[]>`select id, status, storage_path, thumb_path, mime_type, bytes, width, height from media where id = ${id}`;
    if (!r) throw new ApiError("NOT_FOUND", "That photo doesn't exist.");
    const [used] = await tx`select 1 from projects where media_ids @> array[${id}]::uuid[] limit 1`;
    if (used) throw new ApiError("IN_USE", "That photo is used in a project. Remove it from the project first.");
    await tx`delete from media where id = ${id}`;
    return r;
  });
  await deps.storage.remove(MEDIA_BUCKET, [row.storage_path, ...(row.thumb_path ? [row.thumb_path] : [])]);
}
