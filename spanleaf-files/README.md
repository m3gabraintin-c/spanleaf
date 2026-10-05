# Spanleaf

A browser tool for seamless carousels: lay photos along a row of slides, drag one across the edge between two, and export one 1080 pixel wide PNG per slide.

Status: a working prototype, not a launched product. It runs in two modes, set when you build:

- **Demo mode** (default): everything is kept in the browser. No server, no accounts, no payments. This is what the browser tests run against.
- **Real-backend mode** (`NEXT_PUBLIC_DATA_LAYER=api`): Supabase for accounts, database and photo storage, Stripe for billing. The code is written and tested against PostgreSQL with stand-ins for the live services. It has not been run against live Supabase or Stripe. Read `docs/production-setup.md` first.

Known gaps: no templates, no cropping, no switching format after creating a project, no upgrade or account screens, no favicon or app icon, placeholder terms and privacy pages. Nothing has been tested in Safari or on a real phone.

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
