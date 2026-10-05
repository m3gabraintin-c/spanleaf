import { cronRoute } from "@/server/cron";
import { getDb } from "@/server/db";
import { trashPurge } from "@/server/jobs";

export const GET = cronRoute("trash-purge", () => trashPurge(getDb()));
