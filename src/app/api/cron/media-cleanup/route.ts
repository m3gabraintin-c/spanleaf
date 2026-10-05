import { cronRoute } from "@/server/cron";
import { getDb } from "@/server/db";
import { deps } from "@/server/deps";
import { mediaCleanup } from "@/server/jobs";

export const GET = cronRoute("media-cleanup", () => mediaCleanup(getDb(), deps.storage()));
