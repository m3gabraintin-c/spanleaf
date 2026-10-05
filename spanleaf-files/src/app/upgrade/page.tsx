import Link from "next/link";
import { EmptyState, buttonClasses } from "@/ui";

export const metadata = { title: "Upgrade" };

// S05. Stub: built in milestone 4.
export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-6">
      <EmptyState
        icon={<span aria-hidden>…</span>}
        title="Coming in a later milestone"
        as="h1"
        body="This screen isn't built yet."
        action={
          <Link href="/app" className={buttonClasses("primary", "md")}>
            Back to projects
          </Link>
        }
      />
    </main>
  );
}
