import Link from "next/link";
import { PricingCards } from "@/components/PricingCards";
import { buttonClasses } from "@/ui";

export const metadata = { title: "Pricing" };

export default function Pricing() {
  return (
    <main className="mx-auto max-w-(--layout-content-max) px-4 py-12">
      <h1 className="text-xl font-bold">Pricing</h1>
      <p className="mt-2 text-muted">Free up to 10 slides. Studio goes to 20.</p>
      <div className="mt-8">
        <PricingCards />
      </div>
      <Link href="/login" className={buttonClasses("primary", "lg", "mt-8")}>
        Start a carousel
      </Link>
    </main>
  );
}
