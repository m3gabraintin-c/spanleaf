import { getInfo } from "@floot/storage";
import superjson from "superjson";
import { db } from "../helpers/db";
import { failure, reply, slideFile, tokenMatches } from "../helpers/shareServer";
import { OutputType, schema } from "./share-finish_POST.schema";

/** Opens a link once every slide picture has arrived. */
export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const share = await db.selectFrom("shares").selectAll().where("id", "=", input.shareId).executeTakeFirst();
    if (!share || !tokenMatches(share.ownerTokenHash, input.ownerToken)) return reply({ error: "That link doesn't exist." }, 404);
    if (share.status !== "uploading") return reply({ ok: true } satisfies OutputType);
    for (let i = 0; i < share.slideCount; i++) {
      const info = await getInfo({ visibility: "private", filename: slideFile(share.id, i) });
      if (!info.ok || !info.exists) return reply({ error: `Slide ${i + 1} didn't upload. Try making the link again.` }, 400);
    }
    await db.updateTable("shares").set({ status: "ready" }).where("id", "=", share.id).execute();
    return reply({ ok: true } satisfies OutputType);
  } catch (e) {
    return failure(e, "The link couldn't be finished.");
  }
}