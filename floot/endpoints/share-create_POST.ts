import { upload } from "@floot/storage";
import { nanoid } from "nanoid";
import superjson from "superjson";
import { db } from "../helpers/db";
import { SHARE_DAYS, clientKey, failure, hashToken, newToken, reply, slideFile, sweepOldShares, takeDailySlot } from "../helpers/shareServer";
import { OutputType, schema } from "./share-create_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    if (!(await takeDailySlot(clientKey(request)))) return reply({ error: "That's as many links as can be made from one connection in a day. Try again tomorrow." }, 429);
    await sweepOldShares().catch((e) => console.error("Clearing old share links failed", e));

    const shareId = nanoid(16);
    const ownerToken = newToken();
    const expiresAt = new Date(Date.now() + SHARE_DAYS * 864e5);
    await db
      .insertInto("shares")
      .values({ id: shareId, title: input.title, slideCount: input.sizes.length, aspect: input.aspect, ownerTokenHash: hashToken(ownerToken), status: "uploading", expiresAt })
      .execute();

    const uploads: OutputType["uploads"] = [];
    for (let i = 0; i < input.sizes.length; i++) {
      const u = await upload({ visibility: "private", filename: slideFile(shareId, i), contentType: "image/jpeg", sizeBytes: input.sizes[i], ifAbsent: true });
      if (!u.ok) throw new Error(`A slide couldn't be prepared for upload (${u.error.message}).`);
      uploads.push({ presignedUrl: u.presignedUrl, headers: u.headers });
    }
    return reply({ shareId, ownerToken, expiresAt, uploads } satisfies OutputType);
  } catch (e) {
    return failure(e, "The link couldn't be made.");
  }
}