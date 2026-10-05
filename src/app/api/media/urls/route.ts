import { getMediaUrls } from "@/server/media";
import { deps } from "@/server/deps";
import { mediaUrlsInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const POST = userRoute({ name: "media.urls", input: mediaUrlsInput }, async ({ user, db, input }) => ({
  urls: await getMediaUrls({ db, storage: deps.storage() }, user.id, input.ids),
}));
