import "server-only";
import { z } from "zod";

/**
 * Environment variables, read when first needed and grouped by feature. A missing Stripe key
 * doesn't stop the editor from working, and the error names the variable, never its value.
 */
function read<T extends z.ZodRawShape>(group: string, shape: T) {
  const parsed = z.object(shape).safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables for ${group}: ${missing}. See .env.example.`);
  }
  return parsed.data;
}

export const dbEnv = () => read("the database", { DATABASE_URL: z.string().min(1) });

export const supabaseEnv = () =>
  read("Supabase", {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  });

export const supabasePublicEnv = () =>
  read("Supabase", { NEXT_PUBLIC_SUPABASE_URL: z.string().url(), NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1) });

export const stripeEnv = () =>
  read("Stripe", {
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    STRIPE_PRICE_ID: z.string().startsWith("price_"),
    APP_URL: z.string().url(),
  });

export const cronEnv = () => read("cron jobs", { CRON_SECRET: z.string().min(16) });

/** Optional. Without a key the composer still works, with plain defaults instead of the model's choices. */
export const aiEnv = () =>
  read("the AI composer", {
    ANTHROPIC_API_KEY: z.string().min(1),
    // A blank line in .env counts as unset.
    COMPOSE_MODEL: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).default("claude-sonnet-5-5")),
  });
