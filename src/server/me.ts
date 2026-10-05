import "server-only";
import type { Db } from "./db";
import { ApiError } from "./errors";
import type { StripeApi } from "./stripe";

/** GET /api/me. The profile plus what the plan allows. The browser never works this out for itself. */
export async function getMe(db: Db, user: { id: string; email?: string }) {
  return db.asUser(user.id, async (tx) => {
    const [p] = await tx<{ locale: string; onboarding_completed_at: string | null }[]>`
      select locale, onboarding_completed_at from profiles where id = ${user.id}`;
    const [{ premium }] = await tx<{ premium: boolean }[]>`select current_user_is_premium() as premium`;
    const [sub] = await tx<{ trial_end: string | null; status: string; has_used_trial: boolean; cancel_at_period_end: boolean; current_period_end: string | null }[]>`
      select trial_end, status, has_used_trial, cancel_at_period_end, current_period_end from subscriptions`;
    return {
      id: user.id,
      email: user.email ?? "",
      premium,
      maxSlides: premium ? 20 : 10,
      trialEndsAt: sub?.status === "trialing" && sub.trial_end ? new Date(sub.trial_end).toISOString() : null,
      renewsAt: premium && sub?.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
      cancelsAtPeriodEnd: !!sub?.cancel_at_period_end,
      canStartTrial: !sub?.has_used_trial,
      onboardingCompleted: !!p?.onboarding_completed_at,
      locale: p?.locale ?? "en",
    };
  });
}

/** POST /api/onboarding/complete */
export async function completeOnboarding(db: Db, userId: string, input: { locale?: string }) {
  await db.asUser(
    userId,
    (tx) => tx`update profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
                                  locale = coalesce(${input.locale ?? null}, locale)
               where id = ${userId}`,
  );
}

/**
 * DELETE /api/me. Cancels billing first, so a failure leaves the account usable instead of deleted
 * but still being charged. Then flags the account. The account-deletion job removes the files and the
 * sign-in record, and everything else cascades from that.
 */
export async function requestAccountDeletion(deps: { db: Db; stripe: StripeApi }, userId: string) {
  const [sub] = await deps.db.asService(
    (tx) => tx<{ stripe_subscription_id: string | null; status: string }[]>`
      select stripe_subscription_id, status from subscriptions where user_id = ${userId}`,
  );
  if (sub?.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(sub.status)) {
    try {
      await deps.stripe.cancelSubscription(sub.stripe_subscription_id);
    } catch {
      throw new ApiError("NETWORK", "We couldn't cancel your subscription, so nothing was deleted. Try again in a moment.");
    }
  }
  await deps.db.asService(
    (tx) => tx`update profiles set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = ${userId}`,
  );
}
