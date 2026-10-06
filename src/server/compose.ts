import "server-only";
import { layoutCarousel, type LayoutPhoto } from "@/lib/compose";
import { FALLBACK_PLAN, FALLBACK_TAGS } from "@/lib/plan";
import type { ThemeChoice } from "@/lib/themes";
import type { FormatKey } from "@/lib/formats";
import { MAX_SLIDES } from "@/lib/formats";
import type { Project } from "@/data/types";
import type { Db } from "./db";
import { ApiError, isUuid } from "./errors";
import { MEDIA_BUCKET } from "./media";
import { createProject, getProject, patchProject, trashProject } from "./projects";
import type { Storage } from "./storage";
import type { ComposeAi } from "./ai";

interface ComposeInput {
  mediaIds: string[];
  format?: FormatKey;
  title?: string;
  seed?: number;
  /** A built-in theme id or a custom theme. Without it, the model picks one for the photos. */
  theme?: ThemeChoice;
}

interface MediaRow {
  id: string;
  width: number | null;
  height: number | null;
  storage_path: string;
  thumb_path: string | null;
}

/**
 * POST /api/compose. Takes photos the caller has already uploaded and makes a finished carousel project from
 * them. A vision model looks at small thumbnails and makes the taste decisions. If it is missing, slow or
 * wrong, the carousel is still made, with plain defaults, because a result without the AI is better than none.
 */
export async function composeProject(deps: { db: Db; storage: Storage; ai: ComposeAi | null }, userId: string, input: ComposeInput): Promise<Project> {
  const ids = input.mediaIds;
  if (ids.length === 0 || ids.some((id) => !isUuid(id))) throw new ApiError("INVALID", "Choose at least one photo.");
  if (new Set(ids).size !== ids.length) throw new ApiError("INVALID", "The same photo was chosen twice.");

  const rows = await deps.db.asUser(
    userId,
    (tx) => tx<MediaRow[]>`
      select id, width, height, storage_path, thumb_path from media
      where id = any(${ids}::uuid[]) and status = 'ready'`,
  );
  // Row level security only returns the caller's own rows, so a foreign or unfinished id comes back missing.
  if (rows.length !== ids.length) throw new ApiError("INVALID", "Some of those photos aren't yours or aren't ready.");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)!); // the person's order, not the database's

  // Thumbnails are enough for the model and keep the request small. The link lasts ten minutes.
  const signed = await deps.storage.createSignedUrls(MEDIA_BUCKET, ordered.map((r) => r.thumb_path ?? r.storage_path), 600);
  const urls = ordered.map((r) => signed[r.thumb_path ?? r.storage_path]);

  let analysis: Awaited<ReturnType<ComposeAi["analyze"]>> | null = null;
  if (deps.ai && urls.every(Boolean)) {
    try {
      analysis = await deps.ai.analyze(urls.map((url) => ({ url })));
    } catch (e) {
      // Log what kind of failure, never the message: it could hold a signed URL.
      console.error("compose_ai_failed", { name: (e as Error)?.name });
    }
  }

  const photos: LayoutPhoto[] = ordered.map((r, i) => ({
    id: r.id,
    width: r.width ?? 1000,
    height: r.height ?? 1000,
    tags: analysis?.photos[i] ?? FALLBACK_TAGS,
  }));
  const format = input.format ?? "portrait_4_5";
  const { doc, slideCount } = layoutCarousel(photos, analysis?.plan ?? FALLBACK_PLAN, {
    format,
    maxSlides: MAX_SLIDES,
    seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
    theme: input.theme,
  });

  const project = await createProject(deps.db, userId, { format, slideCount, title: input.title || "My carousel" });
  try {
    await patchProject(deps.db, userId, project.id, { rev: project.rev, doc });
  } catch (e) {
    // Don't leave an empty project behind.
    await trashProject(deps.db, userId, project.id).catch(() => {});
    throw e;
  }
  return getProject(deps.db, userId, project.id);
}
