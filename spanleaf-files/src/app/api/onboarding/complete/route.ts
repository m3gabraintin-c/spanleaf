import { completeOnboarding } from "@/server/me";
import { onboardingInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const POST = userRoute({ name: "onboarding.complete", input: onboardingInput }, ({ user, db, input }) =>
  completeOnboarding(db, user.id, input),
);
