import { duplicateProject } from "@/server/projects";
import { userRoute } from "@/server/http";

export const POST = userRoute({ name: "projects.duplicate", limit: { max: 60, windowSec: 3600 } }, async ({ user, db, params }) => ({
  project: await duplicateProject(db, user.id, params.id),
}));
