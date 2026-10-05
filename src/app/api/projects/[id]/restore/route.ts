import { restoreProject } from "@/server/projects";
import { userRoute } from "@/server/http";

export const POST = userRoute({ name: "projects.restore" }, ({ user, db, params }) => restoreProject(db, user.id, params.id));
