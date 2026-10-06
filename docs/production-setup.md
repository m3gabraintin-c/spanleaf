# Setting this up for real

The product is free for everyone: there are no plans or payments to set up. Every step here needs an account of yours, so none of it has been done. Do it in test mode on a staging copy first. Nothing below has been run against live services.

## 1. Supabase

1. Create a project. For production, use a **separate** project from the one you develop against.
2. Copy the project URL, the anon (or "publishable") key, the service role key, and both database connection strings into your host's environment variables. Names are in `.env.example`. The app uses the **transaction pooler** string (port 6543). Migrations need the **direct** string (port 5432).
3. Apply the migrations: `DATABASE_URL=<direct string> npm run db:migrate`, then `DATABASE_URL=<direct string> node scripts/check-rls.mjs`. All checks must pass. If the first one fails with a permission error on `auth.uid`, run `grant usage on schema auth to app_user; grant execute on function auth.uid() to app_user;` in the SQL editor as the project owner, then run the check again.
4. Authentication: set the Site URL to your app's address, and add `<your address>/auth/callback**` (with the two stars) to the allowed redirect URLs.
5. Paste `supabase/templates/magic_link.html` in as the sign-in email template.
6. Turn on backups, and restore one into a scratch project to prove it works. Supabase's free plan has none.

## 2. Email

Create a Resend account, verify a domain you own, and add Resend as Supabase's custom SMTP server. Without it, Supabase sends only a few emails an hour and they tend to land in spam. Copy the SPF and DKIM records exactly as Resend shows them, and add a DMARC record to start with `v=DMARC1; p=none; rua=mailto:you@yourdomain`.

## 3. Environment variables

| name | where from | secret |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_LAYER` | the text `api` | no |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings, API | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon or publishable key | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings, API | **yes** |
| `DATABASE_URL` | the transaction pooler string | **yes** |
| `APP_URL` | `https://` plus your domain, no trailing slash | no |
| `CRON_SECRET` | 16 or more random characters | **yes** |
| `NEXT_PUBLIC_GOOGLE_AUTH` | `1` only if Google sign-in is set up | no |

`NEXT_PUBLIC_` values are built into the site, so changing one means redeploying. Never commit a `.env` file.

## 4. Hosting

The default is Vercel. Connect this repository so `main` deploys and pull requests get preview URLs. The three daily jobs are in `vercel.json`. Vercel's free plan is meant for personal, non-commercial projects, so a paid product will most likely need a paid plan. Read the current terms.

Point your domain at the host as the host's dashboard says, choose one canonical address (with or without `www`), and redirect the other.

## 5. GitHub Actions

- `.github/workflows/ci.yml` runs the type check, the backend tests, both builds and the browser tests on every push and pull request.
- `.github/workflows/migrate.yml` applies the migrations to production when you start it by hand. In the repository settings create an environment called `production`, add yourself as a required reviewer, and put the secret `PRODUCTION_DATABASE_URL` (the direct string) in it. Migrations only go forward, so take a backup first.

Neither workflow has been run on GitHub yet.

## 6. Before real users

- Replace the placeholder terms, privacy and contact pages, and list every service that handles user data: Supabase, Resend, the host, and any analytics.
- Add a way to report and remove content, an account page with a delete button (the API and daily job exist, there is no button), a favicon, a share image, and error tracking.
- Run the sign-in email, a photo upload, an export and a cut-out in a real browser on the live site, then on an iPhone.
- Search the name for trademark conflicts before spending money on it.

## 7. The first week

Check each day: sign-ins arriving, 5xx errors, the three daily jobs (`select job, ok, stats, errors from job_runs order by started_at desc limit 20;`), 429 responses, storage growth, and the support inbox.
