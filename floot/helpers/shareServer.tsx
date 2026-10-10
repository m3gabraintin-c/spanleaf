import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { remove } from "@floot/storage";
import superjson from "superjson";
import { db } from "./db";

/**
 * Server side of share links. A link's slide pictures are private files, read through short-lived addresses. The
 * person who made a link holds a secret token; only its hash is kept here, and it is needed to delete the link.
 * Links expire after 30 days, and expired ones are cleared out as new links are made.
 */

export const SHARE_DAYS = 30;
export const MAX_SHARE_SLIDES = 30;
export const MAX_SLIDE_BYTES = 3_000_000;
export const DAILY_SHARES = 20;
export const MAX_COMMENTS = 300;

export const slideFile = (shareId: string, i: number) => `shares/${shareId}/${i}.jpg`;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

export const tokenMatches = (storedHash: string, token: string) => {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

/** A stand-in for who is asking, for the daily limit: a hash of their network address, never the address itself. */
export const clientKey = (request: Request) => {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(`spanleaf-share:${ip}`).digest("hex").slice(0, 32);
};

/** Counts one more link for this client today. False once they pass the daily limit. */
export const takeDailySlot = async (key: string) => {
  const day = new Date().toISOString().slice(0, 10);
  const row = await db
    .insertInto("shareLimits")
    .values({ clientHash: key, day, made: 1 })
    .onConflict((oc) => oc.columns(["clientHash", "day"]).doUpdateSet((eb) => ({ made: eb("shareLimits.made", "+", 1) })))
    .returning("made")
    .executeTakeFirstOrThrow();
  return row.made <= DAILY_SHARES;
};

export const removeShareFiles = async (shareId: string, count: number) => {
  await Promise.all(Array.from({ length: count }, (_, i) => remove({ visibility: "private", filename: slideFile(shareId, i) })));
};

/** Marks a link deleted and removes its pictures and comments. */
export const retireShare = async (shareId: string, slideCount: number) => {
  await removeShareFiles(shareId, slideCount);
  await db.deleteFrom("shareComments").where("shareId", "=", shareId).execute();
  await db.updateTable("shares").set({ status: "deleted" }).where("id", "=", shareId).execute();
};

/** Clears a few expired links, and links whose upload was never finished. */
export const sweepOldShares = async () => {
  const now = new Date();
  const dayAgo = new Date(Date.now() - 864e5);
  const old = await db
    .selectFrom("shares")
    .select(["id", "slideCount"])
    .where("status", "<>", "deleted")
    .where((eb) => eb.or([eb("expiresAt", "<", now), eb.and([eb("status", "=", "uploading"), eb("createdAt", "<", dayAgo)])]))
    .limit(10)
    .execute();
  for (const s of old) await retireShare(s.id, s.slideCount);
};

export const reply = (body: unknown, status = 200) => new Response(superjson.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const failure = (e: unknown, fallback: string) => {
  const message = e instanceof Error && e.name === "ZodError" ? "That request wasn't valid." : e instanceof Error ? e.message : fallback;
  return reply({ error: message || fallback }, 400);
};