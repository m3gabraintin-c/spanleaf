import "server-only";
import type { Db } from "./db";
import { ApiError } from "./errors";
import { safeReturnTo } from "./schemas";
import type { StripeApi } from "./stripe";

const TRIAL_DAYS = 7;

interface SubRow {
  stripe_customer_id: string;
  status: string;
  has_used_trial: boolean;
}

async function ensureCustomer(deps: { db: Db; stripe: StripeApi }, user: { id: string; email?: string }): Promise<SubRow> {
  const find = () =>
    deps.db.asService(
      (tx) => tx<SubRow[]>`select stripe_customer_id, status, has_used_trial from subscriptions where user_id = ${user.id}`,
    );
  const [existing] = await find();
  if (existing) return existing;
  if (!user.email) throw new ApiError("INVALID", "Your account has no email address.");
  const customer = await deps.stripe.createCustomer({ email: user.email, userId: user.id });
  // Two tabs can race here. The unique user_id means one row wins and both read the same one.
  await deps.db.asService(
    (tx) => tx`insert into subscriptions (user_id, stripe_customer_id) values (${user.id}, ${customer.id}) on conflict (user_id) do nothing`,
  );
  return (await find())[0];
}

/** POST /api/billing/checkout. Stripe hosts the payment page. There is no card form in this app. */
export async function createCheckout(
  deps: { db: Db; stripe: StripeApi; appUrl: string; priceId: string },
  user: { id: string; email?: string },
  input: { returnTo?: string },
) {
  const sub = await ensureCustomer(deps, user);
  if (["trialing", "active", "past_due"].includes(sub.status)) {
    throw new ApiError("ALREADY_SUBSCRIBED", "You already have a subscription. Manage it from your account.");
  }
  const back = `${deps.appUrl.replace(/\/$/, "")}${safeReturnTo(input.returnTo)}`;
  const sep = back.includes("?") ? "&" : "?";
  const session = await deps.stripe.createCheckoutSession({
    customerId: sub.stripe_customer_id,
    userId: user.id,
    priceId: deps.priceId,
    // One free trial per account, and it asks for no card. Nothing can be charged when it ends. If the person
    // wants to keep Premium, they subscribe again, and that checkout does ask for a card.
    trialDays: sub.has_used_trial ? undefined : TRIAL_DAYS,
    trialWithoutCard: true,
    successUrl: `${back}${sep}checkout=success`,
    cancelUrl: `${back}${sep}checkout=cancelled`,
  });
  return { url: session.url };
}

/** POST /api/billing/portal. Update the card, see invoices, or cancel. Cancelling is one click there. */
export async function createPortal(deps: { db: Db; stripe: StripeApi; appUrl: string }, userId: string, input: { returnTo?: string }) {
  const [sub] = await deps.db.asService(
    (tx) => tx<{ stripe_customer_id: string }[]>`select stripe_customer_id from subscriptions where user_id = ${userId}`,
  );
  if (!sub) throw new ApiError("NOT_FOUND", "You don't have a subscription to manage.");
  const session = await deps.stripe.createPortalSession({
    customerId: sub.stripe_customer_id,
    returnUrl: `${deps.appUrl.replace(/\/$/, "")}${safeReturnTo(input.returnTo)}`,
  });
  return { url: session.url };
}
