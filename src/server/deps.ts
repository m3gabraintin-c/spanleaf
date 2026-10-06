import "server-only";
import { anthropicAi } from "./ai";
import { aiEnv, supabasePublicEnv } from "./env";
import { supabaseAuthAdmin, supabaseStorage } from "./storage";

/** Real service clients, built on first use. Routes call these. Tests pass fakes straight to the logic. */
export const deps = {
  storage: () => supabaseStorage(),
  authAdmin: () => supabaseAuthAdmin(),
  /** The vision model, or null when no key is set. composeProject copes with null. */
  ai: () => (process.env.ANTHROPIC_API_KEY ? anthropicAi({ apiKey: aiEnv().ANTHROPIC_API_KEY, model: aiEnv().COMPOSE_MODEL }) : null),
  publicBase: () => supabasePublicEnv().NEXT_PUBLIC_SUPABASE_URL,
};
