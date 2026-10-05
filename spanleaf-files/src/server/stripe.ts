import "server-only";
import Stripe from "stripe";
import { stripeEnv } from "./env";

/** What we keep from a Stripe subscription. Everything else is ignored. */
export interface SubSnapshot {
  id: string;
  customerId: string;
  status: string;
  priceId: string | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  userId: string | null;
}

/** The slice of the Stripe API the app uses. Tests supply a fake. */
export interface StripeApi {
  createCustomer(p: { email: string; userId: string }): Promise<{ id: string }>;
  createCheckoutSession(p: {
    customerId: string;
    userId: string;
    priceId: string;
    trialDays?: number;
    /** With a trial, don't ask for a card. If none is added by the end, the subscription cancels. No surprise charge is possible. */
    trialWithoutCard?: boolean;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPortalSession(p: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  retrieveSubscription(id: string): Promise<SubSnapshot>;
  cancelSubscription(id: string): Promise<void>;
}

const toDate = (n: number | null | undefined) => (typeof n === "number" ? new Date(n * 1000) : null);

/**
 * Stripe moved current_period_end from the subscription onto its items in a 2025 API version, so
 * read either place.
 */
export function snapshotOf(s: unknown): SubSnapshot {
  const sub = s as {
    id: string;
    customer: string | { id: string };
    status: string;
    trial_end?: number | null;
    current_period_end?: number | null;
    cancel_at_period_end?: boolean;
    metadata?: Record<string, string>;
    items?: { data?: { price?: { id: string }; current_period_end?: number | null }[] };
  };
  const item = sub.items?.data?.[0];
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: sub.status,
    priceId: item?.price?.id ?? null,
    trialEnd: toDate(sub.trial_end),
    currentPeriodEnd: toDate(sub.current_period_end ?? item?.current_period_end),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    userId: sub.metadata?.user_id ?? null,
  };
}

let client: Stripe | undefined;
export function stripeClient(): Stripe {
  if (!client) client = new Stripe(stripeEnv().STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return client;
}

export function realStripe(): StripeApi {
  const s = stripeClient();
  return {
    async createCustomer({ email, userId }) {
      const c = await s.customers.create({ email, metadata: { user_id: userId } });
      return { id: c.id };
    },
    async createCheckoutSession(p) {
      const session = await s.checkout.sessions.create({
        mode: "subscription",
        customer: p.customerId,
        client_reference_id: p.userId,
        line_items: [{ price: p.priceId, quantity: 1 }],
        ...(p.trialDays && p.trialWithoutCard ? { payment_method_collection: "if_required" as const } : {}),
        subscription_data: {
          metadata: { user_id: p.userId },
          ...(p.trialDays ? { trial_period_days: p.trialDays } : {}),
          ...(p.trialDays && p.trialWithoutCard ? { trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } } : {}),
        },
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
      });
      if (!session.url) throw new Error("stripe: checkout session has no URL");
      return { url: session.url };
    },
    async createPortalSession(p) {
      const session = await s.billingPortal.sessions.create({ customer: p.customerId, return_url: p.returnUrl });
      return { url: session.url };
    },
    async retrieveSubscription(id) {
      return snapshotOf(await s.subscriptions.retrieve(id));
    },
    async cancelSubscription(id) {
      await s.subscriptions.cancel(id);
    },
  };
}
