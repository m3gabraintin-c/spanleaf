import { composeProject } from "@/server/compose";
import { deps } from "@/server/deps";
import { composeInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

// The model looks at up to 30 thumbnails. Give it room before the platform cuts the request off.
export const maxDuration = 60;

/** Each call can cost a model request, so the limit is tight. */
export const POST = userRoute({ name: "compose", input: composeInput, limit: { max: 12, windowSec: 3600 } }, async ({ user, db, input }) => ({
  project: await composeProject({ db, storage: deps.storage(), ai: deps.ai() }, user.id, input),
}));
