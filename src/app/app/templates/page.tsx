"use client";
import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { AppShell, useRequireUser } from "@/components/AppChrome";
import { EmptyState, buttonClasses } from "@/ui";

// S07. Stub: built in milestone 3.
export default function TemplatesPage() {
  const me = useRequireUser();
  if (!me) return <div className="min-h-dvh" aria-busy="true" />;
  return (
    <AppShell me={me}>
      <main className="mx-auto max-w-md px-4 py-12">
        <EmptyState
          icon={<LayoutTemplate aria-hidden className="size-6" />}
          title="Templates are coming"
          as="h1"
          body="For now, start from a blank canvas."
          action={
            <Link href="/app/new" className={buttonClasses("primary", "md")}>
              New project
            </Link>
          }
        />
      </main>
    </AppShell>
  );
}
