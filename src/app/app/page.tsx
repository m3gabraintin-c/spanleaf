"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderOpen, ImagePlus, Plus } from "lucide-react";
import { data, type ProjectSummary } from "@/data";
import { ProjectCard } from "@/components/ProjectCard";
import { AppShell, useRequireUser } from "@/components/AppChrome";
import { Button, EmptyState, Skeleton, buttonClasses } from "@/ui";

export default function ProjectsPage() {
  const me = useRequireUser();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  /** The project just deleted, so the page can offer to bring it back. */
  const [deleted, setDeleted] = useState<ProjectSummary | null>(null);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    if (!me) return;
    data.listProjects().then(setProjects, () => setFailed(true));
  }, [me]);

  if (!me) return <div className="min-h-dvh" aria-busy="true" />;

  /** Runs a change to a project, and says so if it fails. */
  const attempt = async (what: () => Promise<void>) => {
    setProblem(undefined);
    try {
      await what();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn't work. Try again.");
    }
  };
  const reload = () => data.listProjects().then(setProjects, () => setFailed(true));

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

        {problem ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {problem}
          </p>
        ) : null}
        {deleted ? (
          <div role="status" className="mt-4 flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 text-sm">
            <span className="min-w-0 truncate">Deleted &ldquo;{deleted.title}&rdquo;.</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                attempt(async () => {
                  await data.restoreProject(deleted.id);
                  setDeleted(null);
                  await reload();
                })
              }
            >
              Undo
            </Button>
          </div>
        ) : null}

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
                  <ProjectCard
                    project={p}
                    onRename={(title) =>
                      attempt(async () => {
                        await data.renameProject(p.id, title);
                        await reload();
                      })
                    }
                    onDuplicate={() =>
                      attempt(async () => {
                        await data.duplicateProject(p.id);
                        await reload();
                      })
                    }
                    onDelete={() =>
                      attempt(async () => {
                        await data.deleteProject(p.id);
                        setDeleted(p);
                        await reload();
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppShell>
  );
}
