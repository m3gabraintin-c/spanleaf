import { getUrl } from "@floot/storage";
import { db } from "../helpers/db";
import { failure, reply, slideFile } from "../helpers/shareServer";
import { OutputType, schema } from "./share-get_GET.schema";

export async function handle(request: Request) {
  try {
    const { shareId } = schema.parse({ shareId: new URL(request.url).searchParams.get("shareId") ?? "" });
    const share = await db.selectFrom("shares").selectAll().where("id", "=", shareId).executeTakeFirst();
    if (!share || share.status !== "ready") return reply({ error: "This link doesn't exist, or it was deleted." }, 404);
    if (share.expiresAt.getTime() < Date.now()) return reply({ error: "This link has expired. Links last 30 days." }, 410);
    const slides: string[] = [];
    for (let i = 0; i < share.slideCount; i++) {
      const u = await getUrl({ visibility: "private", filename: slideFile(share.id, i), expiresInSeconds: 3600 });
      if (!u.ok) throw new Error("A slide picture couldn't be found.");
      slides.push(u.url);
    }
    const comments = await db.selectFrom("shareComments").select(["id", "name", "body", "slide", "createdAt"]).where("shareId", "=", share.id).orderBy("createdAt", "asc").limit(500).execute();
    return reply({ title: share.title, aspect: share.aspect, slides, comments, expiresAt: share.expiresAt } satisfies OutputType);
  } catch (e) {
    return failure(e, "This link couldn't be opened.");
  }
}