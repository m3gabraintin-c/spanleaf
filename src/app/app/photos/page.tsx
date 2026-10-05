"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { data, DataError, type MediaRecord } from "@/data";
import { ACCEPTED_IMAGE_TYPES, MAX_BATCH_PHOTOS, UPLOAD_CONCURRENCY } from "@/lib/formats";
import { uploadMany, type BatchProgress } from "@/lib/upload";
import { AppShell, useRequireUser } from "@/components/AppChrome";
import type { ThemeId } from "@/lib/themes";
import { Button, IconButton, ProgressBar, ThemePicker } from "@/ui";

interface Added {
  media: MediaRecord;
  thumb?: string;
}

const messageOf = (e: unknown, fallback: string) => (e instanceof DataError || e instanceof Error ? e.message : fallback);

/** Pick as many photos as you like and get a finished carousel back. */
export default function FromPhotosPage() {
  const me = useRequireUser();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Added[]>([]);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [composing, setComposing] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [theme, setTheme] = useState<ThemeId | "auto">("auto");

  if (!me) return <div className="min-h-dvh" aria-busy="true" />;

  const uploading = progress !== null;
  const room = MAX_BATCH_PHOTOS - photos.length;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (room <= 0) {
      setNotes([`That's the most one carousel takes: ${MAX_BATCH_PHOTOS} photos. Remove one to add another.`]);
      return;
    }
    const problems: string[] = [];
    setNotes([]);
    setProgress({ total: Math.min(files.length, room), finished: 0, failed: 0 });
    try {
      const result = await uploadMany(Array.from(files), (f) => data.uploadImage(f), {
        concurrency: UPLOAD_CONCURRENCY,
        maxFiles: room,
        onProgress: setProgress,
        onSettled: async (r) => {
          if (r.error !== undefined) {
            problems.push(`${r.file.name}: ${r.error}`);
            return;
          }
          const media = r.value!;
          const urls = await data.getMediaUrls([media.id]).catch(() => ({}) as Record<string, { thumbUrl: string }>);
          setPhotos((p) => [...p, { media, thumb: urls[media.id]?.thumbUrl }]);
        },
      });
      if (result.skipped > 0) problems.push(`Only ${room} more photo${room === 1 ? "" : "s"} fit, so ${result.skipped} ${result.skipped === 1 ? "was" : "were"} left out.`);
    } catch (e) {
      problems.push(messageOf(e, "Something went wrong adding those photos."));
    } finally {
      setNotes(problems);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  async function make() {
    setNotes([]);
    setComposing(true);
    try {
      const project = await data.composeProject({ mediaIds: photos.map((p) => p.media.id), theme: theme === "auto" ? undefined : theme });
      router.push(`/app/project/${project.id}`);
    } catch (e) {
      setNotes([messageOf(e, "Couldn't make the carousel. Try again.")]);
      setComposing(false);
    }
  }

  const busy = uploading || composing;

  return (
    <AppShell me={me}>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-bold">Start from photos</h1>
        <p className="mt-2 text-sm text-muted">
          Add up to {MAX_BATCH_PHOTOS} photos. We&apos;ll arrange them into a carousel you can keep editing. Photos stay in the order you add them.
        </p>

        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void onFiles(e.target.files)}
        />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant={photos.length ? "secondary" : "primary"} icon={<ImagePlus aria-hidden className="size-4" />} disabled={busy || room <= 0} onClick={() => input.current?.click()}>
            {photos.length ? "Add more photos" : "Choose photos"}
          </Button>
          <span className="text-sm text-muted" aria-live="polite">
            {photos.length} of {MAX_BATCH_PHOTOS}
          </span>
        </div>

        {progress ? (
          <div className="mt-4">
            <ProgressBar label={`Adding ${Math.min(progress.finished + 1, progress.total)} of ${progress.total}`} value={progress.total ? (progress.finished / progress.total) * 100 : 0} />
          </div>
        ) : null}

        {notes.length > 0 ? (
          <ul role="alert" className="mt-4 flex flex-col gap-1 text-sm text-danger">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}

        {photos.length > 0 ? (
          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4" aria-label="Chosen photos, in order">
            {photos.map(({ media, thumb }, i) => (
              <li key={media.id} className="relative overflow-hidden rounded-md border border-line bg-canvas">
                {/* The thumbnail is a short-lived signed address, so next/image can't optimise it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb ? <img src={thumb} alt={media.name} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center text-xs text-muted">{media.name}</div>}
                <span className="absolute left-1 top-1 rounded-pill bg-page px-2 text-xs font-medium tabular-nums">{i + 1}</span>
                <span className="absolute right-1 top-1">
                  <IconButton label={`Remove ${media.name}`} disabled={busy} onClick={() => setPhotos((p) => p.filter((x) => x.media.id !== media.id))}>
                    <X aria-hidden className="size-4" />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-8 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink">Theme</h2>
          <ThemePicker label="Theme" auto value={theme} onValueChange={setTheme} disabled={composing} />
        </div>

        <div className="mt-8">
          <Button loading={composing} disabled={photos.length === 0 || uploading} onClick={() => void make()}>
            {composing ? "Arranging your photos" : "Make my carousel"}
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
