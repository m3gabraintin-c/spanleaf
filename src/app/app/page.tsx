"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderOpen, ImagePlus, Plus } from "lucide-react";
import { data, type ProjectSummary } from "@/data";
import { FORMATS } from "@/lib/formats";
import { AppShell, useRequireUser } from "@/components/AppChrome";
import { EmptyState, Skeleton, buttonClasses } from "@/ui";

function when(iso: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export default function ProjectsPage() {
  const me = useRequireUser();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!me) return;
    data.listProjects().then(setProjects, () => setFailed(true));
  }, [me]);

  if (!me) return <div className="min-h-dvh" aria-busy="true" />;

  return (
    <AppShell me={me}>
      <main className="mx-auto max-w-(--layout-content-max) px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold">Your projects</h1>
          <div className="flex items-center gap-2">
            <Link href="/app/photos" className={buttonClasses("secondary", "md")}>
              <ImagePlus aria-hidden className="mr-2 size-4" />
              Start from photos
            </Link>
            <Link href="/app/new" className={buttonClasses("primary", "md")}>
              <Plus aria-hidden className="mr-2 size-4" />
              New project
            </Link>
          </div>
        </div>

        <div className="mt-8">
          {failed ? (
            <EmptyState icon={<FolderOpen aria-hidden className="size-6" />} title="Couldn't load your projects" body="Reload the page to try again." />
          ) : projects === null ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading projects">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex flex-col gap-2">
                  <Skeleton className="aspect-[4/5] w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </li>
              ))}
            </ul>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<FolderOpen aria-hidden className="size-6" />}
              title="Nothing here yet"
              body="Start with a blank carousel and add your first photos."
              action={
                <Link href="/app/new" className={buttonClasses("primary", "md")}>
                  New project
                </Link>
              }
            />
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/project/${p.id}`} className="group flex flex-col gap-2 rounded-lg">
                    <div className="grid aspect-[4/5] place-items-center rounded-md border border-line bg-canvas text-sm text-muted t-fast group-hover:shadow-card">
                      {p.slideCount} slides &middot; {FORMATS[p.format].label}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                      <p className="text-xs text-muted">Edited {when(p.updatedAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppShell>
  );
}
