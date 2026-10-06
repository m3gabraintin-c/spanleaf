import "server-only";
import type { Db } from "./db";

/** GET /api/me. The profile. */
export async function getMe(db: Db, user: { id: string; email?: string }) {
  return db.asUser(user.id, async (tx) => {
    const [p] = await tx<{ locale: string; onboarding_completed_at: string | null }[]>`
      select locale, onboarding_completed_at from profiles where id = ${user.id}`;
    return { id: user.id, email: user.email ?? "", onboardingCompleted: !!p?.onboarding_completed_at, locale: p?.locale ?? "en" };
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
 * DELETE /api/me. Flags the account. The account-deletion job removes the files and the sign-in record, and
 * everything else cascades from that.
 */
export async function requestAccountDeletion(db: Db, userId: string) {
  await db.asService((tx) => tx`update profiles set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = ${userId}`);
}
