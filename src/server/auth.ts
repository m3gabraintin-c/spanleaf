import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicEnv } from "./env";

export interface SessionUser {
  id: string;
  email?: string;
}

/** Supabase server client bound to the request's cookies. Used for sign-in callbacks and session checks. */
export async function serverSupabase() {
  const env = supabasePublicEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a place that can't set cookies. The browser client refreshes them instead.
        }
      },
    },
  });
}

/**
 * Who is calling. getClaims verifies the access token's signature, so a forged cookie fails.
 * A signed-out session stays valid until its token expires (an hour by default), which is why
 * account deletion is also checked against the database on every request.
 */
export async function getUser(): Promise<SessionUser | null> {
  try {
    const supabase = await serverSupabase();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) return null;
    return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
  } catch {
    return null;
  }
}
