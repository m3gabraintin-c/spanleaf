import { listTemplates } from "@/server/templates";
import { deps } from "@/server/deps";
import { templatesInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const GET = userRoute({ name: "templates.list", input: templatesInput }, ({ user, db, input }) =>
  listTemplates(db, user.id, input, deps.publicBase()),
);
