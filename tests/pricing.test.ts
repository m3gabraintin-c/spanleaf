import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_SLIDES_FREE, MAX_SLIDES_PREMIUM } from "@/lib/formats";
import { PLANS, annualSavingPercent, usd } from "@/lib/pricing";

describe("plans", () => {
  it("the slide limits on the pricing page are the limits the database enforces", () => {
    assert.equal(PLANS.free.slides, MAX_SLIDES_FREE);
    assert.equal(PLANS.studio.slides, MAX_SLIDES_PREMIUM);
  });
  it("yearly costs less than twelve months, and more than one", () => {
    assert.ok(PLANS.studio.annualUsd < PLANS.studio.monthlyUsd * 12);
    assert.ok(PLANS.studio.annualUsd > PLANS.studio.monthlyUsd);
  });
  it("the saving shown is the real one, rounded, and between 0 and 100", () => {
    const s = annualSavingPercent();
    assert.equal(s, Math.round((1 - 29.99 / (3.99 * 12)) * 100));
    assert.ok(s > 0 && s < 100);
  });
  it("prices print with two decimals and a dollar sign", () => {
    assert.equal(usd(29.99), "$29.99");
    assert.equal(usd(3), "$3.00");
  });
  it("the trial is 7 days, as the checkout code offers", () => {
    assert.equal(PLANS.studio.trialDays, 7);
  });
});
