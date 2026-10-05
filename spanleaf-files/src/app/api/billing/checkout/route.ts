import { createCheckout } from "@/server/billing";
import { deps } from "@/server/deps";
import { checkoutInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const POST = userRoute({ name: "billing.checkout", input: checkoutInput, limit: { max: 10, windowSec: 3600 } }, ({ user, db, input }) =>
  createCheckout({ db, ...deps.billing() }, user, input),
);
