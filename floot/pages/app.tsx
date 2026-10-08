import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import { Copy, Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Skeleton } from "../components/Skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/Select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog";
import { ThemeModeSwitch } from "../components/ThemeModeSwitch";
import { TEMPLATES } from "../helpers/templates";
import { track } from "../helpers/analytics";
import { FORMATS, FORMAT_KEYS, FormatKey, MAX_SLIDES, Project, clampSlides } from "../helpers/carouselModel";
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  restoreProject,
  storageUse,
} from "../helpers/projectStorage";
import { backupFile, downloadBlob, restoreFile } from "../helpers/projectFiles";
import { useRef } from "react";
import styles from "./app.module.css";

const when = (t: number) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(t));

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);
  const opener = useRef<HTMLInputElement>(null);

  const reload = useCallback(
    () =>
      listProjects().then(
        (p) => {
          setProjects(p);
          setFailed(false);
          void storageUse().then(setSpace);
        },
        () => setFailed(true),
      ),
    [],
  );
  useEffect(() => void reload(), [reload]);

  const attempt = async (what: () => Promise<void>) => {
    try {
      await what();
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work. Try again.");
    }
  };

  const remove = (p: Project) =>
    attempt(async () => {
      await deleteProject(p.id);
      toast(`Deleted “${p.title}”`, {
        action: { label: "Undo", onClick: () => void attempt(() => restoreProject(p.id)) },
        duration: 8000,
      });
    });

  const backup = async (p: Project) => {
    try {
      const { blob, name, missingVideos } = await backupFile(p);
      downloadBlob(blob, name);
      track("project_backup", { slides: p.design.slideCount });
      toast.success(missingVideos ? `Backup downloaded. ${missingVideos} video${missingVideos === 1 ? " wasn't" : "s weren't"} in this browser, so they're not in it.` : "Backup downloaded. Keep it somewhere safe.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The backup couldn't be made.");
    }
  };

  const open = (file: File) =>
    attempt(async () => {
      const p = await restoreFile(file);
      track("project_restored", { slides: p.design.slideCount });
      toast.success(`Opened “${p.title}”.`);
    });

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Projects - Spanleaf</title>
      </Helmet>
      <header className={styles.header}>
        <Link to="/" className={styles.wordmark}>
          Spanleaf
        </Link>
        <div className={styles.headerActions}>
          <ThemeModeSwitch />
          <input
            ref={opener}
            type="file"
            accept=".spanleaf,application/json"
            hidden
            aria-label="Choose a backup file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void open(f);
            }}
          />
          <Button variant="outline" onClick={() => opener.current?.click()}>
            <Upload size={16} /> Open a backup
          </Button>
          <Button onClick={() => setMaking(true)}>
            <Plus size={16} /> New carousel
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Your carousels</h1>
        <p className={styles.sub}>
          Saved in this browser only. Download a backup of anything you'd hate to lose: clearing site data, or a different device, means starting again without one.
          {space && ` This site is using ${(space.used / 1e6).toFixed(0)} MB of about ${(space.quota / 1e9).toFixed(1)} GB.`}
        </p>
        {space && space.used / space.quota > 0.8 && (
          <p role="alert" className={styles.notice}>
            Storage is nearly full. Download backups, then delete projects with large videos to make room.
          </p>
        )}

        {failed ? (
          <div role="alert" className={styles.notice}>
            Your projects couldn't be loaded. This browser may be blocking storage.
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        ) : projects === null ? (
          <ul className={styles.grid} aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton style={{ aspectRatio: "4 / 5" }} />
              </li>
            ))}
          </ul>
        ) : projects.length === 0 ? (
          <div className={styles.empty}>
            <h2>Nothing here yet</h2>
            <p>Start a carousel, add photos, and export each slide when you're done.</p>
            <Button onClick={() => setMaking(true)}>
              <Plus size={16} /> New carousel
            </Button>
          </div>
        ) : (
          <ul className={styles.grid}>
            {projects.map((p) => (
              <li key={p.id} className={styles.card}>
                <Link to={`/app/project/${p.id}`} className={styles.cardLink}>
                  <div className={styles.thumb}>
                    {p.thumb ? <img src={p.thumb} alt="" className={styles.thumbImg} /> : <span>No preview yet</span>}
                  </div>
                  <p className={styles.cardTitle}>{p.title}</p>
                  <p className={styles.cardMeta}>
                    {p.design.slideCount} {p.design.slideCount === 1 ? "slide" : "slides"} · {FORMATS[p.design.format].label} · Edited {when(p.updatedAt)}
                  </p>
                </Link>
                <div className={styles.actions} role="group" aria-label={`Actions for ${p.title}`}>
                  <Button variant="ghost" size="icon-sm" aria-label={`Rename ${p.title}`} onClick={() => setRenaming(p)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Download a backup of ${p.title}`} title="Download a backup" onClick={() => void backup(p)}>
                    <Download size={14} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Duplicate ${p.title}`} onClick={() => void attempt(async () => void (await duplicateProject(p.id)))}>
                    <Copy size={14} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.title}`} onClick={() => void remove(p)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className={styles.footer}>
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
      </footer>

      <NewDialog
        open={making}
        onOpenChange={setMaking}
        onCreate={async (title, format, slides, template) => {
          const p = await createProject(title, format, slides, template);
          track("project_created", { template: template ?? "blank", slides: p.design.slideCount });
          navigate(`/app/project/${p.id}`);
        }}
      />
      <RenameDialog
        project={renaming}
        onClose={() => setRenaming(null)}
        onRename={(title) => attempt(() => renameProject(renaming!.id, title))}
      />
    </div>
  );
}

function NewDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (title: string, format: FormatKey, slides: number, template?: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<FormatKey>("portrait_4_5");
  const [slides, setSlides] = useState(3);
  const [template, setTemplate] = useState("blank");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await onCreate(name, format, slides, template === "blank" ? undefined : template);
    } catch {
      toast.error("The project couldn't be created.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New carousel</DialogTitle>
          <DialogDescription>You can change the shape and add or remove slides later.</DialogDescription>
        </DialogHeader>
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Name</span>
            <Input value={name} maxLength={80} placeholder="Untitled" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className={styles.field}>
            <span id="shape-label">Slide shape</span>
            <Select value={format} onValueChange={(v) => setFormat(v as FormatKey)}>
              <SelectTrigger aria-labelledby="shape-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {FORMATS[k].label} {FORMATS[k].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className={styles.field}>
            <span>Number of slides (1 to {MAX_SLIDES})</span>
            <Input type="number" inputMode="numeric" min={1} max={MAX_SLIDES} value={slides} disabled={template !== "blank"} onChange={(e) => setSlides(clampSlides(Number(e.target.value)))} />
          </label>
          <div className={styles.field}>
            <span id="template-label">Start from</span>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger aria-labelledby="template-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">Blank</SelectItem>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} - {t.blurb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {template !== "blank" && <small className={styles.note}>A template starts with empty frames. Select a frame and add a photo, or add several photos and they fill the frames in order. The number of slides comes from the template.</small>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void create()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ project, onClose, onRename }: { project: Project | null; onClose: () => void; onRename: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  useEffect(() => setTitle(project?.title ?? ""), [project]);
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Give the carousel a name you will recognise.</DialogDescription>
        </DialogHeader>
        <label className={styles.field}>
          <span>Name</span>
          <Input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onRename(title).then(onClose);
            }}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void onRename(title).then(onClose)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
