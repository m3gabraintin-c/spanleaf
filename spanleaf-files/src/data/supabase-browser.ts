"use client";
import { createBrowserClient } from "@supabase/ssr";
import { DataError } from "./types";

let client: ReturnType<typeof createBrowserClient> | undefined;

/**
 * The browser's Supabase client. It handles sign-in and keeps the session cookie fresh. It never
 * touches data tables: the browser has no database access, only the signed upload URLs the API hands out.
 */
export function browserSupabase() {
  if (!client) {
    // These two must be written out in full so Next can inline them into the bundle.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new DataError("INTERNAL", "Supabase isn't configured. See .env.example.");
    client = createBrowserClient(url, key);
  }
  return client;
}
