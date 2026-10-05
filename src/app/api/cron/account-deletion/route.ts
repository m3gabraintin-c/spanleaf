import { cronRoute } from "@/server/cron";
import { getDb } from "@/server/db";
import { deps } from "@/server/deps";
import { accountDeletion } from "@/server/jobs";

export const GET = cronRoute("account-deletion", () => accountDeletion(getDb(), deps.storage(), deps.authAdmin()));
