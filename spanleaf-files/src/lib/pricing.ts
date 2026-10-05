/**
 * The plans, in one place. These are proposed prices, not tested with customers. Changing a number here
 * changes the pricing page and the landing page. The Stripe price you create must match the annual figure.
 */
export const PLANS = {
  free: {
    name: "Free",
    who: "For short carousels, and for trying it out",
    slides: 10,
  },
  studio: {
    name: "Studio",
    who: "For people who post every week",
    slides: 20,
    annualUsd: 29.99,
    monthlyUsd: 3.99,
    trialDays: 7,
  },
} as const;

export const usd = (n: number) => `$${n.toFixed(2)}`;

/** How much of a year's monthly price the annual plan saves, as a whole percent. */
export const annualSavingPercent = () => Math.round((1 - PLANS.studio.annualUsd / (PLANS.studio.monthlyUsd * 12)) * 100);
