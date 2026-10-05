import "server-only";
import type { Db } from "./db";
import type { StripeApi, SubSnapshot } from "./stripe";

const STATUSES = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"];

export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: unknown };
}

/** Which subscription an event is about. Handles the field moving between Stripe API versions. */
export function subscriptionIdOf(event: StripeEventLike): string | null {
  const o = event.data.object as Record<string, unknown> & {
    parent?: { subscription_details?: { subscription?: unknown } };
  };
  const pick = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String((v as { id: unknown }).id) : null);
  switch (event.type) {
    case "checkout.session.completed":
      return o.mode === "subscription" ? pick(o.subscription) : null;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return typeof o.id === "string" ? o.id : null;
    case "invoice.payment_failed":
    case "invoice.paid":
      return pick(o.subscription) ?? pick(o.parent?.subscription_details?.subscription);
    default:
      return null;
  }
}

/** Writes Stripe's current view of a subscription into our table. Safe to run any number of times. */
export async function applySnapshot(db: Db, snap: SubSnapshot): Promise<"applied" | "ignored"> {
  try {
    await db.asService(async (tx) => {
      const [byCustomer] = await tx<{ user_id: string }[]>`select user_id from subscriptions where stripe_customer_id = ${snap.customerId}`;
      const userId = byCustomer?.user_id ?? snap.userId;
      if (!userId) throw new Error("stripe: subscription has no known user");
      const status = STATUSES.includes(snap.status) ? snap.status : "incomplete";
      await tx`
        insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, price_id, status,
                                   trial_end, current_period_end, cancel_at_period_end, has_used_trial)
        values (${userId}, ${snap.customerId}, ${snap.id}, ${snap.priceId}, ${status},
                ${snap.trialEnd}, ${snap.currentPeriodEnd}, ${snap.cancelAtPeriodEnd}, ${snap.trialEnd !== null})
        on conflict (user_id) do update set
          stripe_customer_id = excluded.stripe_customer_id,
          stripe_subscription_id = excluded.stripe_subscription_id,
          price_id = excluded.price_id,
          status = excluded.status,
          trial_end = excluded.trial_end,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          has_used_trial = subscriptions.has_used_trial or excluded.has_used_trial`;
    });
    return "applied";
  } catch (e) {
    // 23503: the user no longer exists (their account was deleted). Retrying would never help.
    if ((e as { code?: string }).code === "23503") return "ignored";
    throw e;
  }
}

/**
 * Handles one verified event. The event id is stored first, so Stripe's retries and duplicate
 * deliveries do nothing. Instead of trusting the order events arrive in, the handler fetches the
 * subscription's current state from Stripe each time.
 */
export async function handleStripeEvent(deps: { db: Db; stripe: StripeApi }, event: StripeEventLike): Promise<"processed" | "duplicate"> {
  const [inserted] = await deps.db.asService(
    (tx) => tx<{ id: string }[]>`insert into stripe_events (id, type) values (${event.id}, ${event.type}) on conflict (id) do nothing returning id`,
  );
  if (!inserted) {
    const [prev] = await deps.db.asService((tx) => tx<{ processed_at: string | null }[]>`select processed_at from stripe_events where id = ${event.id}`);
    // An earlier attempt that crashed before finishing is retried. A finished one is skipped.
    if (prev?.processed_at) return "duplicate";
  }

  const subId = subscriptionIdOf(event);
  if (subId) await applySnapshot(deps.db, await deps.stripe.retrieveSubscription(subId));

  await deps.db.asService((tx) => tx`update stripe_events set processed_at = now() where id = ${event.id}`);
  return "processed";
}

/**
 * Everything the webhook route does after reading the request. Takes the signature check as a
 * function so tests can run the real check offline.
 */
export async function processWebhook(
  deps: { db: Db; stripe: StripeApi; verify: (rawBody: string, signature: string) => StripeEventLike },
  rawBody: string,
  signature: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!signature) return { status: 400, body: { error: "missing signature" } };
  let event: StripeEventLike;
  try {
    event = deps.verify(rawBody, signature);
  } catch {
    return { status: 400, body: { error: "invalid signature" } };
  }
  try {
    return { status: 200, body: { received: true, result: await handleStripeEvent(deps, event) } };
  } catch (e) {
    // A 500 makes Stripe retry. Log the event id and type only, nothing about the customer.
    console.error("stripe_webhook_failed", { id: event.id, type: event.type, name: (e as Error).name });
    return { status: 500, body: { error: "processing failed" } };
  }
}
