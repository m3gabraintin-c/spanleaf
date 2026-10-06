import { getMe, requestAccountDeletion } from "@/server/me";
import { deleteMeInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const GET = userRoute({ name: "me.get" }, ({ user, db }) => getMe(db, user));

export const DELETE = userRoute(
  { name: "me.delete", input: deleteMeInput, limit: { max: 5, windowSec: 3600 }, allowDeleting: true },
  async ({ user, db }) => requestAccountDeletion(db, user.id),
);
