import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { stripeEnv } from "@/server/env";
import { realStripe, stripeClient } from "@/server/stripe";
import { processWebhook, type StripeEventLike } from "@/server/stripe-webhook";

// No session here: Stripe calls this. The signature is the authentication.
export async function POST(req: Request) {
  try {
    const secret = stripeEnv().STRIPE_WEBHOOK_SECRET;
    const raw = await req.text(); // the signature covers the exact bytes, so don't parse first
    const out = await processWebhook(
      {
        db: getDb(),
        stripe: realStripe(),
        verify: (body, sig) => stripeClient().webhooks.constructEvent(body, sig, secret) as unknown as StripeEventLike,
      },
      raw,
      req.headers.get("stripe-signature"),
    );
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    console.error("stripe_webhook_setup_failed", { name: (e as Error).name });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
