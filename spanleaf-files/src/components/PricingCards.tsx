"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { data } from "@/data";
import { PLANS, annualSavingPercent, usd } from "@/lib/pricing";
import { PlanCard } from "@/ui";

/**
 * The two plans. Studio shows as coming soon until billing is switched on, so nobody is sold something they
 * can't yet buy. Prices come from src/lib/pricing.ts.
 */
export function PricingCards({ idPrefix = "plan" }: { idPrefix?: string }) {
  const [plan, setPlan] = useState<"free" | "studio">("studio");
  const live = data.capabilities.billing;
  const s = PLANS.studio;
  return (
    <div>
      <div role="radiogroup" aria-label="Plan" className="grid gap-4 md:grid-cols-2">
        <PlanCard
          name={`${PLANS.free.name}`}
          price="$0"
          blurb={PLANS.free.who}
          features={[`Up to ${PLANS.free.slides} slides per project`, "Every editing tool", "No watermark", "Export at 1080 pixels wide"]}
          selected={plan === "free"}
          onSelect={() => setPlan("free")}
        />
        <PlanCard
          name={s.name}
          price={usd(s.annualUsd)}
          period="a year"
          badge={live ? `${s.trialDays}-day trial, no card` : "Coming soon"}
          blurb={s.who}
          features={[`Up to ${s.slides} slides per project`, "Everything in Free", `Or ${usd(s.monthlyUsd)} a month`, `Yearly saves ${annualSavingPercent()}%`]}
          selected={plan === "studio"}
          onSelect={() => setPlan("studio")}
        />
      </div>
      <ul className="mt-4 flex flex-col gap-1 text-sm text-muted" aria-label={live ? "Billing terms" : "Planned billing terms"}>
        <li className="flex items-center gap-2">
          <Check aria-hidden className="size-4 shrink-0 text-success" strokeWidth={3} />
          {live ? "No weekly plans. Monthly or yearly, nothing else." : "Planned: monthly and yearly plans, and no weekly ones."}
        </li>
        <li className="flex items-center gap-2">
          <Check aria-hidden className="size-4 shrink-0 text-success" strokeWidth={3} />
          {live ? "The trial asks for no card, so it can't charge you when it ends." : "Planned: a 7-day trial that asks for no card, so it can't charge you when it ends."}
        </li>
      </ul>
      {!live ? <p className="mt-3 text-sm text-muted">Studio isn't on sale yet. These are the planned prices.</p> : null}
      <span className="sr-only">{idPrefix}</span>
    </div>
  );
}
