-- Hardening and backend support. Runs after 0001.
--
-- Access model, after this migration:
--   * The browser has NO database access. anon and authenticated lose every table and function
--     grant, so Supabase's auto-generated REST API can't read or write anything even if it is
--     left switched on.
--   * The Next.js server connects as postgres, then does `set local role app_user` plus the
--     caller's claims, so row level security applies to every query it runs for a user.
--   * Webhooks, cron and account deletion run as the service role (they bypass RLS on purpose).

-- ---------------------------------------------------------------------------
-- the role the server uses on behalf of a signed-in user
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin noinherit;
  end if;
end $$;

-- lets the connecting role (postgres on Supabase) `set role app_user`
grant app_user to current_user;
grant usage on schema public to app_user;

-- Row level security policies call auth.uid(). On a hosted Supabase project that function may not be
-- executable by a custom role, so grant it. If this migration isn't allowed to (it doesn't own the auth
-- schema), carry on and run scripts/check-rls.mjs afterwards. It says plainly whether policies work.
do $$
begin
  grant usage on schema auth to app_user;
  grant execute on function auth.uid() to app_user;
exception when insufficient_privilege then
  raise notice 'could not grant auth.uid() to app_user. Run scripts/check-rls.mjs to see if it is needed.';
end $$;

-- ---------------------------------------------------------------------------
-- take the browser roles out of the database
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- new columns and tables
-- ---------------------------------------------------------------------------

-- Set when the user asks to delete their account. The API refuses further requests from them
-- and the account-deletion job finishes the work.
alter table profiles add column deletion_requested_at timestamptz;
create index on profiles (deletion_requested_at) where deletion_requested_at is not null;

-- A media row can only point at its owner's folder. Even if some future code path forgets to check,
-- one user can never be given a signed URL for another user's file.
alter table media add constraint media_path_in_owner_folder
  check (storage_path like user_id::text || '/' || id::text || '.%'
     and (thumb_path is null or thumb_path like user_id::text || '/' || id::text || '.%'));

-- Fixed-window rate limit counters. One row per key per window.
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
create index on rate_limits (window_start);

-- One row per cron run. This is the log you read when a job misbehaves.
create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  stats jsonb not null default '{}',
  errors jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on job_runs (job, started_at desc);
create trigger job_runs_updated before update on job_runs
  for each row execute function set_updated_at();

alter table rate_limits enable row level security;
alter table job_runs enable row level security;
-- no policies on either: only the service role reads or writes them

-- ---------------------------------------------------------------------------
-- grants for app_user (the server, acting for a user). Row level security still filters every row.
-- ---------------------------------------------------------------------------

grant select, update on profiles to app_user;
grant select on subscriptions to app_user;
grant select on templates, template_docs, assets to app_user;
grant select, insert, update, delete on projects to app_user;
grant select, insert, update, delete on media to app_user;

-- Re-create the three catalogue policies for app_user (0001 targeted `authenticated`).
drop policy templates_select on templates;
drop policy assets_select on assets;
drop policy template_docs_select on template_docs;

create policy templates_select on templates for select to app_user
  using (status = 'published');
create policy assets_select on assets for select to app_user
  using (is_active);
create policy template_docs_select on template_docs for select to app_user
  using (exists (
    select 1 from templates t
    where t.id = template_docs.template_id
      and t.status = 'published'
      and (not t.is_premium or current_user_is_premium())
  ));

-- Entitlement function for the caller. Callable by app_user only.
revoke all on function current_user_is_premium() from public, anon, authenticated;
grant execute on function current_user_is_premium() to app_user;

-- The slide limit trigger runs as its owner, so it needs no grant. The internal helpers stay revoked.

-- ---------------------------------------------------------------------------
-- upload limits at the storage layer. The API checks declared size and type, and checks the stored
-- file again, but this stops an oversize upload from ever landing. Photos are capped at 25 MB.
-- ---------------------------------------------------------------------------

update storage.buckets set file_size_limit = 26214400 where id = 'media';

do $$
begin
  -- Supabase's buckets table has this column. The test stand-in may not.
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'media';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- service role: Supabase creates it. Make sure it can use the new tables.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on all tables in schema public to service_role;
    grant execute on all functions in schema public to service_role;
  end if;
end $$;
