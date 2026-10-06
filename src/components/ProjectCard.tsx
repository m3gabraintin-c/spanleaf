"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import type { ProjectSummary } from "@/data";
import { FORMATS } from "@/lib/formats";
import { Button, Dialog, IconButton, TextField } from "@/ui";

const when = (iso: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** One project on the projects page, with what can be done to it without opening it. */
export function ProjectCard({
  project,
  onRename,
  onDuplicate,
  onDelete,
}: {
  project: ProjectSummary;
  onRename: (title: string) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [busy, setBusy] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);

  const save = async () => {
    setBusy(true);
    try {
      await onRename(title);
      setRenaming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Link href={`/app/project/${project.id}`} className="group flex flex-col gap-2 rounded-lg">
        <div className="grid aspect-[4/5] place-items-center rounded-md border border-line bg-canvas text-sm text-muted t-fast group-hover:shadow-card">
          {project.slideCount} {project.slideCount === 1 ? "slide" : "slides"} &middot; {FORMATS[project.format].label}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{project.title}</p>
          <p className="text-xs text-muted">Edited {when(project.updatedAt)}</p>
        </div>
      </Link>
      <div className="flex items-center gap-1" role="group" aria-label={`Actions for ${project.title}`}>
        <IconButton
          ref={renameButton}
          label={`Rename ${project.title}`}
          onClick={() => {
            setTitle(project.title);
            setRenaming(true);
          }}
        >
          <Pencil aria-hidden className="size-4" />
        </IconButton>
        <IconButton label={`Duplicate ${project.title}`} onClick={() => void onDuplicate()}>
          <Copy aria-hidden className="size-4" />
        </IconButton>
        <IconButton label={`Delete ${project.title}`} onClick={() => void onDelete()}>
          <Trash2 aria-hidden className="size-4" />
        </IconButton>
      </div>
      <Dialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename project"
        restoreFocusTo={renameButton}
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              Save
            </Button>
          </>
        }
      >
        <TextField
          label="Name"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
      </Dialog>
    </div>
  );
}
