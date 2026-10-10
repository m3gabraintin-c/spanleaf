import superjson from "superjson";
import { db } from "../helpers/db";
import { failure, reply, retireShare, tokenMatches } from "../helpers/shareServer";
import { OutputType, schema } from "./share-delete_POST.schema";

/** Deletes a link, its pictures and its comments. Only the person holding the link's token can. */
export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const share = await db.selectFrom("shares").select(["id", "slideCount", "ownerTokenHash", "status"]).where("id", "=", input.shareId).executeTakeFirst();
    if (!share || !tokenMatches(share.ownerTokenHash, input.ownerToken)) return reply({ error: "That link doesn't exist." }, 404);
    if (share.status !== "deleted") await retireShare(share.id, share.slideCount);
    return reply({ ok: true } satisfies OutputType);
  } catch (e) {
    return failure(e, "The link couldn't be deleted.");
  }
}