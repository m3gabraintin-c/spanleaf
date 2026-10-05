# Spanleaf

A browser tool for seamless carousels: lay photos along a row of slides, drag one across the edge between two, and export one 1080 pixel wide PNG per slide.

Status: a working prototype, not a launched product. It runs in two modes, set when you build:

- **Demo mode** (default): everything is kept in the browser. No server, no accounts, no payments. This is what the browser tests run against.
- **Real-backend mode** (`NEXT_PUBLIC_DATA_LAYER=api`): Supabase for accounts, database and photo storage, Stripe for billing. The code is written and tested against PostgreSQL with stand-ins for the live services. It has not been run against live Supabase or Stripe. Read `docs/production-setup.md` first.

Known gaps: no account or upgrade screens, no favicon or app icon, placeholder terms and privacy pages. The editor screens added with the themes work (Themes, Crop, Size, Stickers, Frames, Adjust, Draw, Cut out) are covered by tests of their logic but have not been run in a browser, and nothing has been tested in Safari or on a real phone.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000, demo mode
```

## Test it

```bash
npm run typecheck
npm test               # backend: database, access rules, billing, jobs, editor store.
                       # Needs PostgreSQL and a role that can create databases:
                       # export TEST_ADMIN_URL=postgres://USER:PASSWORD@localhost:5432/postgres
npm run build          # demo mode build (leave NEXT_PUBLIC_DATA_LAYER unset)
npm run test:e2e       # Playwright, Chromium only, serves on port 3100
```

If a server from an earlier build is still running on port 3100, the browser tests run against stale files and time out. Stop it first.

`AVOID_NAMES="Name One,Name Two" npm run test:e2e` makes the landing page test also check that none of those names appear on it.

## Real-backend commands

```bash
DATABASE_URL=<direct connection string> npm run db:migrate        # applies supabase/migrations in order, safe to rerun
DATABASE_URL=<direct connection string> node scripts/check-rls.mjs # do the access rules work on this database?
DATABASE_URL=<development database only> npm run db:seed          # fake templates and sticker records
```

## Start from photos (the AI composer)

`/app/photos` takes up to 30 photos, uploads them three at a time, and makes a finished carousel from them. The arrangement is split in two on purpose:

- A vision model (`src/server/ai.ts`) looks at small thumbnails and decides only what needs taste: each photo's focus point and best shot, a theme, a background colour, pattern and caption font, and a title and captions.
- A plain function (`src/lib/compose.ts`, `layoutCarousel`) does all the geometry: slide count, positions, crops, tilt, torn edges, and the photo that runs across each slide edge. Same seed gives the same result, and its output goes through the same `DocSchema` as every saved document.

The model's reply is validated strictly (hex colours, a fixed font list, a fixed theme list, short single-line text). If the model is missing, slow or wrong, the carousel is still made with plain defaults. Set `ANTHROPIC_API_KEY` (and optionally `COMPOSE_MODEL`) to turn it on. Demo mode has no model and always uses the defaults. The route is limited to 12 requests an hour per person, because each one can cost a model call.

### Themes

A theme (`src/lib/themes.ts`) is plain data: the layout (overlapping, tidy grid or tight), tilt, photo cuts, border and shadow, tape and doodles, caption style and font, and a starting palette. Six are built in: Scrapbook, Polaroid, Dreamy, Editorial, Clean and Film. Some follow the colours the model picked for the photos and some keep their own (`palette.adapt`).

The Themes tool in the editor changes a carousel's theme, shuffles it, and lets you change one thing at a time (background, pattern, tilt, tape and doodles, photo edges, captions, borders). `customise()` turns those controls into a new valid theme, which is saved inside the project, so your own themes travel with it. This works without the model: what it said about the photos is saved in the document (`doc.compose`) and `restyleDoc` (`src/lib/restyle.ts`) lays the same photos out again. Text and stickers you added by hand are not kept when you restyle, and one undo brings everything back.

Decorations are small SVGs drawn for this app (`src/lib/stickers.ts`), stored in a document as `builtin:<id>` with a colour. The editor only draws ids on that list, so a document can't make it load an arbitrary address.

### Draw and Cut out

Draw makes one drawing layer per stroke (a pen, a see-through highlighter, or an eraser). Strokes are smoothed, simplified to at most 200 points and saved as fractions of the layer's box, so they move, resize and turn like any layer.

Cut out removes a photo's background on the person's own device. It runs a small open model (U²-Net small, Apache 2.0, 4.6 MB) with onnxruntime-web (MIT) in a worker, then tidies the mask, can add a die-cut style outline, trims to the object and swaps the layer for the new picture, uploaded like any photo, so the object stays exactly where it was. Undo brings the original back. The model and the runtime are not committed: `npm run models` fetches them into `public/models` (the build and CI run it), and the model is checked against a checksum. The first use downloads about 20 MB. It works best when the object stands out from what is behind it. The test that runs the real model needs about 1 GB of memory and is skipped when the model hasn't been fetched.

## Design tokens and fonts

Colours, type, spacing and radii live in `design/tokens.json`. After editing it:

```bash
npm run tokens         # writes src/styles/tokens.css and tailwind.theme.css, then checks WCAG contrast
```

Slide fonts: 30 open-licence families are copied from the `@fontsource` packages into `public/fonts` by `npm run fonts`. Licences are in `public/fonts/LICENSES.md`.

## Where things are

| path | what |
| --- | --- |
| `src/app/` | Routes. Marketing pages under `(site)`, signed-in screens under `app/`, the API under `api/` |
| `src/editor/` | The canvas (Konva), the store with undo, autosave, export, and the panels |
| `src/data/` | The data layer. `types.ts` is the contract. `fake.ts` runs in the browser. `api.ts` calls the routes |
| `src/server/` | Server logic: projects, media, billing, the Stripe webhook, jobs. Written to take its database, storage and Stripe clients as arguments, so tests can pass fakes |
| `src/ui/` | Interface components |
| `src/lib/` | Formats, the saved document schema (zod), image preparation, fonts, pricing |
| `supabase/migrations/` | The database, in order |
| `tests/` | Backend tests |
| `e2e/` | Browser tests |
| `scripts/` | Migration, seed, checks, and screenshot scripts |
| `docs/production-setup.md` | What to set up, in order, to run it for real |

## Licence

None chosen yet. Until one is added, all rights are reserved by the author.
