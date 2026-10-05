import { completeUpload } from "@/server/media";
import { deps } from "@/server/deps";
import { userRoute } from "@/server/http";

export const POST = userRoute({ name: "media.complete" }, async ({ user, db, params }) => ({
  media: await completeUpload({ db, storage: deps.storage() }, user.id, params.id),
}));
