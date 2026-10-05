import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { buttonClasses } from "@/ui";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-page">
      <div className="mx-auto flex h-(--layout-header) max-w-(--layout-content-max) items-center justify-between px-4">
        {/* prefetch off: prefetching the home page makes every other page download the hero image it never shows */}
        <Link href="/" prefetch={false} className="text-lg font-semibold text-ink">
          {APP_NAME}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link href="/pricing" className={buttonClasses("ghost", "md")}>
            Pricing
          </Link>
          <Link href="/login" className={buttonClasses("primary", "md")}>
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const links = [
    ["/terms", "Terms"],
    ["/privacy", "Privacy"],
    ["/refund", "Refunds"],
    ["/contact", "Contact"],
  ] as const;
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-(--layout-content-max) flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">&copy; {new Date().getFullYear()} {APP_NAME}</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-4">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="text-sm text-muted t-fast hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function LegalStub({ title }: { title: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-4 text-base text-muted">
        Placeholder page. The real text has to be written (and checked by a lawyer) before you launch. It must match what the product actually collects and charges.
      </p>
    </main>
  );
}
