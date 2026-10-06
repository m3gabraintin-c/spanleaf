import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { buttonClasses } from "@/ui";

const STEPS = [
  { title: "Add your photos", body: "Choose JPEG, PNG or WebP files up to 25 MB each. Photos stored sideways turn upright by themselves." },
  { title: "Drag across the edge", body: "Lay a photo over the line between two slides. It snaps to slide centres and edges. Prefer the keyboard? Nudge with the arrow keys, or type an exact position." },
  { title: "Export", body: "Download a zip with one PNG for each slide, 1080 pixels wide. Upload them in order." },
];

const FEATURES = [
  { title: "Made for a computer", body: "A big canvas, keyboard shortcuts, and every control within reach of the keyboard as well as the mouse." },
  { title: "Exact placement", body: "Snap guides, boxes for exact position, size and rotation, and undo and redo that go back 100 steps." },
  { title: "Saved as you go", body: "Each change is saved a moment after you make it, and the header says when it has been." },
  { title: "Free, with no limits on pages", body: "Every tool is free. Add as many slides as the project needs." },
  { title: "Plain exports", body: "Every slide is an ordinary PNG with no watermark, the same size whatever screen you work on." },
  { title: "Text that matches", body: "30 free fonts come with the app, so the text you see in the editor is the text you export." },
  { title: "Layers you control", body: "Reorder, lock and duplicate. Stack photos and text however you like." },
];

const FAQ = [
  { q: "Does it work on a phone?", a: "Use a computer for the best results. The editor is made for a mouse and keyboard, and we haven't tuned it for phones yet." },
  { q: "Can I post straight to Instagram?", a: "Not yet. Export your slides, then upload them in order the way you upload any photos." },
  { q: "Can I bring in projects from other carousel apps?", a: "No. Start from your own photos." },
  { q: "Which photos can I use?", a: "JPEG, PNG and WebP, up to 25 MB each. HEIC photos from an iPhone aren't supported yet, so export them as JPEG first." },
  { q: "Is there a watermark?", a: "No." },
  { q: "What does it cost?", a: "Nothing. Every tool is free, with no plans, no trial and no limit on how many slides a project has." },
  { q: "How many slides can I make?", a: "As many as you need, up to 500 in one project. A saved project also has to fit in 2 MB and 500 layers." },
];

export default function Home() {
  return (
    <main>
      <section aria-labelledby="hero" className="mx-auto grid max-w-(--layout-content-max) items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <h1 id="hero" className="text-xl font-bold sm:text-display">
            Seamless carousels, made at your desk.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted">
            For photographers and designers who would rather edit on a computer than move files to a phone. Spread one picture across as many slides as you like, then export each slide at 1080 pixels wide.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className={buttonClasses("primary", "lg")}>
              Start a carousel
            </Link>
            <Link href="/login" className={buttonClasses("secondary", "lg")}>
              Sign in
            </Link>
          </div>
        </div>
        {/* A screenshot of the real editor with our own sample artwork. Width and height stop the page jumping as it loads. */}
        <img
          src="/launch/editor.webp"
          width={1800}
          height={1125}
          // It's the biggest thing above the fold, so say so. This also makes the browser's preload match the image.
          fetchPriority="high"
          loading="eager"
          decoding="async"
          alt={`The ${APP_NAME} editor showing one landscape picture spread across three slides, with the slide edges visible and a Layers panel on the right.`}
          className="h-auto w-full rounded-lg border border-line shadow-pop"
        />
      </section>

      <section aria-labelledby="problem" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-(--layout-content-max) px-4 py-14">
          <h2 id="problem" className="text-lg font-semibold">
            A long carousel shouldn't be a fight
          </h2>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Lining up photos across a dozen slides on a phone is fiddly work, and some apps lose that work when they close.
          </p>
          <p className="mt-3 max-w-2xl text-base text-muted">
            {APP_NAME} runs in your browser, on the screen you already edit on, and saves after every change.
          </p>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-(--layout-content-max) px-4 py-14">
        <h2 id="how" className="text-lg font-semibold">
          How it works
        </h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2">
              <span aria-hidden className="grid size-8 place-items-center rounded-pill bg-accent-soft text-sm font-semibold text-accent">
                {i + 1}
              </span>
              <h3 className="text-base font-semibold">{s.title}</h3>
              <p className="text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-(--layout-content-max) px-4 py-14">
          <h2 id="features" className="text-lg font-semibold">
            What you get
          </h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex flex-col gap-1 rounded-lg border border-line bg-page p-5">
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="text-sm text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="faq" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <h2 id="faq" className="text-lg font-semibold">
            Questions
          </h2>
          <div className="mt-4 divide-y divide-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer text-base font-medium text-ink marker:text-muted">{f.q}</summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="cta" className="mx-auto max-w-(--layout-content-max) px-4 py-16 text-center">
        <h2 id="cta" className="text-xl font-bold">
          Make your first carousel.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-muted">It takes a few photos and a few minutes.</p>
        <Link href="/login" className={buttonClasses("primary", "lg", "mt-6")}>
          Start a carousel
        </Link>
      </section>
    </main>
  );
}
