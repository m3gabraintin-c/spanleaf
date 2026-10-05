import { listAssets } from "@/server/templates";
import { deps } from "@/server/deps";
import { assetsInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const GET = userRoute({ name: "assets.list", input: assetsInput }, ({ user, db, input }) => listAssets(db, user.id, input, deps.publicBase()));
