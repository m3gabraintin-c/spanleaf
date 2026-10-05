import { createUploadUrl } from "@/server/media";
import { deps } from "@/server/deps";
import { uploadUrlInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const POST = userRoute({ name: "media.uploadUrl", input: uploadUrlInput, limit: { max: 120, windowSec: 600 } }, ({ user, db, input }) =>
  createUploadUrl({ db, storage: deps.storage() }, user.id, input),
);
