import { cronRoute } from "@/server/cron";
import { getDb } from "@/server/db";
import { deps } from "@/server/deps";
import { stripeReconcile } from "@/server/jobs";

export const GET = cronRoute("stripe-reconcile", () => stripeReconcile(getDb(), deps.stripe()));
