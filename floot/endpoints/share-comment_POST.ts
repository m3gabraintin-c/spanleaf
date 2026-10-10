import superjson from "superjson";
import { db } from "../helpers/db";
import { MAX_COMMENTS, failure, reply } from "../helpers/shareServer";
import { OutputType, schema } from "./share-comment_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const share = await db.selectFrom("shares").select(["id", "status", "expiresAt", "slideCount"]).where("id", "=", input.shareId).executeTakeFirst();
    if (!share || share.status !== "ready") return reply({ error: "This link doesn't exist, or it was deleted." }, 404);
    if (share.expiresAt.getTime() < Date.now()) return reply({ error: "This link has expired." }, 410);
    if (input.slide !== null && input.slide >= share.slideCount) return reply({ error: "That slide isn't in this carousel." }, 400);
    const { count } = await db.selectFrom("shareComments").select((eb) => eb.fn.countAll<number>().as("count")).where("shareId", "=", share.id).executeTakeFirstOrThrow();
    if (Number(count) >= MAX_COMMENTS) return reply({ error: "This link has as many comments as it can take." }, 429);
    const row = await db
      .insertInto("shareComments")
      .values({ shareId: share.id, name: input.name, body: input.body, slide: input.slide })
      .returning(["id", "name", "body", "slide", "createdAt"])
      .executeTakeFirstOrThrow();
    return reply(row satisfies OutputType);
  } catch (e) {
    return failure(e, "Your comment couldn't be posted.");
  }
}