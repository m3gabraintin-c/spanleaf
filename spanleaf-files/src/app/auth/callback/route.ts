import { NextResponse } from "next/server";
import { serverSupabase } from "@/server/auth";
import { safeReturnTo } from "@/server/schemas";

// The magic link lands here with a one-time code. Swap it for a session cookie, then go to the app.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = process.env.APP_URL ?? url.origin;
  const code = url.searchParams.get("code");
  const next = safeReturnTo(url.searchParams.get("next") ?? undefined);
  if (code) {
    try {
      const supabase = await serverSupabase();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    } catch {
      // fall through to the error page
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
