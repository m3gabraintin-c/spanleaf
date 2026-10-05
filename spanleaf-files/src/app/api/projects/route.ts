import { createProject, listProjects } from "@/server/projects";
import { createProjectInput, listProjectsInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const GET = userRoute({ name: "projects.list", input: listProjectsInput }, ({ user, db, input }) => listProjects(db, user.id, input));

export const POST = userRoute(
  { name: "projects.create", input: createProjectInput, limit: { max: 60, windowSec: 3600 } },
  async ({ user, db, input }) => ({ project: await createProject(db, user.id, input) }),
);
