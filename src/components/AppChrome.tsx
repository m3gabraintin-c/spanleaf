"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { data, type Me } from "@/data";
import { APP_NAME } from "@/lib/brand";
import { Button } from "@/ui";

/** Redirects to /login when signed out. Returns null until the check finishes. */
export function useRequireUser(): Me | null {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    void data.getMe().then((m) => {
      if (!alive) return;
      if (m) setMe(m);
      else router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    });
    return () => {
      alive = false;
    };
  }, [router]);
  return me;
}

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const router = useRouter();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-page">
        <div className="mx-auto flex h-(--layout-header-mobile) max-w-(--layout-content-max) items-center justify-between px-4 lg:h-(--layout-header)">
          <Link href="/app" className="text-lg font-semibold text-ink">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-muted sm:inline">{me.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await data.signOut();
                router.replace("/");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
