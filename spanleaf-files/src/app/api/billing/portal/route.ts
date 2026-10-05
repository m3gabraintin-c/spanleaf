import { createPortal } from "@/server/billing";
import { deps } from "@/server/deps";
import { checkoutInput } from "@/server/schemas";
import { userRoute } from "@/server/http";

export const POST = userRoute({ name: "billing.portal", input: checkoutInput, limit: { max: 20, windowSec: 3600 } }, ({ user, db, input }) => {
  const { stripe, appUrl } = deps.billing();
  return createPortal({ db, stripe, appUrl }, user.id, input);
});
