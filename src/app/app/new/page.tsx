"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { data, DataError } from "@/data";
import { FORMATS, FORMAT_KEYS, MAX_SLIDES, type FormatKey } from "@/lib/formats";
import { AppShell, useRequireUser } from "@/components/AppChrome";
import { Button, IconButton, SegmentedControl, TextField } from "@/ui";

export default function NewProjectPage() {
  const me = useRequireUser();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<FormatKey>("portrait_4_5");
  const [slides, setSlides] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!me) return <div className="min-h-dvh" aria-busy="true" />;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const p = await data.createProject({ format, slideCount: slides, title });
      router.push(`/app/project/${p.id}`);
    } catch (err) {
      setError(err instanceof DataError ? err.message : "Couldn't create the project.");
      setBusy(false);
    }
  }

  return (
    <AppShell me={me}>
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-xl font-bold">New project</h1>
        <form onSubmit={create} className="mt-6 flex flex-col gap-6" noValidate>
          <TextField label="Name" placeholder="Untitled" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />

          <div className="flex flex-col gap-2">
            <span id="format-label" className="text-sm font-medium text-ink">
              Format
            </span>
            <SegmentedControl
              label="Format"
              value={format}
              onValueChange={setFormat}
              options={FORMAT_KEYS.map((k) => ({ value: k, label: FORMATS[k].label }))}
            />
            <p className="text-sm text-muted">
              {FORMATS[format].name}, {FORMATS[format].width} by {FORMATS[format].height} pixels per slide.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink" id="slides-label">
              Slides
            </span>
            <div className="flex items-center gap-2" role="group" aria-labelledby="slides-label">
              <IconButton label="Fewer slides" disabled={slides <= 1} onClick={() => setSlides((n) => n - 1)}>
                <Minus aria-hidden className="size-5" />
              </IconButton>
              <input
                aria-label="Number of slides"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_SLIDES}
                value={slides}
                onChange={(e) => setSlides(Math.min(MAX_SLIDES, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
                className="h-10 w-20 rounded-md border border-field bg-page text-center text-lg font-semibold tabular-nums"
              />
              <IconButton label="More slides" disabled={slides >= MAX_SLIDES} onClick={() => setSlides((n) => n + 1)}>
                <Plus aria-hidden className="size-5" />
              </IconButton>
            </div>
            <p className="text-sm text-muted">As many as you like, up to {MAX_SLIDES}. You can add and remove slides later.</p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Create project
            </Button>
            <Link href="/app" className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-ink t-fast hover:bg-surface-hover">
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
