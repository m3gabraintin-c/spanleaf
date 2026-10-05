import "server-only";
import { stripeEnv, supabasePublicEnv } from "./env";
import { supabaseAuthAdmin, supabaseStorage } from "./storage";
import { realStripe } from "./stripe";

/** Real service clients, built on first use. Routes call these. Tests pass fakes straight to the logic. */
export const deps = {
  storage: () => supabaseStorage(),
  authAdmin: () => supabaseAuthAdmin(),
  stripe: () => realStripe(),
  billing: () => {
    const e = stripeEnv();
    return { stripe: realStripe(), appUrl: e.APP_URL, priceId: e.STRIPE_PRICE_ID };
  },
  publicBase: () => supabasePublicEnv().NEXT_PUBLIC_SUPABASE_URL,
};
