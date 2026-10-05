import { deleteMedia } from "@/server/media";
import { deps } from "@/server/deps";
import { userRoute } from "@/server/http";

export const DELETE = userRoute({ name: "media.delete" }, ({ user, db, params }) => deleteMedia({ db, storage: deps.storage() }, user.id, params.id));
