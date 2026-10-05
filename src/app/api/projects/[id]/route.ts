import { getProject, patchProject, trashProject } from "@/server/projects";
import { patchProjectInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const GET = userRoute({ name: "projects.get" }, async ({ user, db, params }) => ({ project: await getProject(db, user.id, params.id) }));

export const PATCH = userRoute({ name: "projects.patch", input: patchProjectInput }, ({ user, db, params, input }) =>
  patchProject(db, user.id, params.id, input),
);

export const DELETE = userRoute({ name: "projects.delete" }, ({ user, db, params }) => trashProject(db, user.id, params.id));
