-- Carousel and collage editor (web). Postgres on Supabase.
-- Initial schema. Written 2026-10-04.
-- Access model: row level security on every table. Writes to subscriptions,
-- stripe_events, templates, template_docs and assets happen only through the
-- service role (webhooks, cron, staff tooling), never from the browser.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles (one per auth user)
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'en',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- subscriptions (mirror of Stripe; written only by the webhook and cron)
-- No row means free plan.
-- ---------------------------------------------------------------------------

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  price_id text,
  status text not null default 'incomplete'
    check (status in ('trialing','active','past_due','canceled','unpaid',
                      'incomplete','incomplete_expired','paused')),
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  has_used_trial boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (status, current_period_end);
create trigger subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

-- Webhook de-duplication. Stripe event ids are text, so this table keeps the
-- Stripe id as its primary key instead of a uuid.
create table stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Entitlements. is_premium(uid) is internal: nobody should be able to ask
-- whether some other user is premium. The browser-facing version takes no
-- argument and uses the caller's own id.
create or replace function is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subscriptions s
    where s.user_id = uid
      and s.status in ('trialing','active')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;
revoke all on function is_premium(uuid) from public, anon, authenticated;

create or replace function current_user_is_premium() returns boolean
language sql stable security definer set search_path = public as $$
  select is_premium(auth.uid());
$$;
grant execute on function current_user_is_premium() to authenticated;

create or replace function max_slides(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when is_premium(uid) then 20 else 10 end;
$$;
revoke all on function max_slides(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- templates (listing metadata) and template_docs (the gated content)
-- Split so a free user can see a premium template's card with a lock badge,
-- while the document itself stays behind row level security.
-- author_id null means made by staff. Community templates come later.
-- ---------------------------------------------------------------------------

create table templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  style_tag text not null,
  format text not null
    check (format in ('portrait_4_5','portrait_3_4','square','story_9_16')),
  slide_count smallint not null check (slide_count between 1 and 20),
  is_premium boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft','published','removed')),
  author_id uuid references auth.users(id) on delete set null,
  thumbnail_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on templates (status, style_tag, sort_order);
create index on templates (author_id);
create trigger templates_updated before update on templates
  for each row execute function set_updated_at();

-- One document per template, so template_id is the primary key.
create table template_docs (
  template_id uuid primary key references templates(id) on delete cascade,
  doc jsonb not null
    check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 2097152),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger template_docs_updated before update on template_docs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- assets: stickers and frames you made or licensed. License is required so
-- nothing of unknown origin gets in.
-- ---------------------------------------------------------------------------

create table assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sticker','frame')),
  name text not null,
  category text not null,
  storage_path text not null,
  license text not null,
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assets (kind, category) where is_active;
create trigger assets_updated before update on assets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- projects
-- Elements live inside doc (jsonb), not in their own table. See
-- architecture.md for why. Array order of doc.elements is the z-order.
-- ---------------------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  format text not null
    check (format in ('portrait_4_5','portrait_3_4','square','story_9_16')),
  slide_count smallint not null default 3 check (slide_count between 1 and 20),
  doc jsonb not null
    check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 2097152),
  rev integer not null default 0,
  media_ids uuid[] not null default '{}',
  source_template_id uuid references templates(id) on delete set null,
  thumbnail_path text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on projects (user_id, updated_at desc) where deleted_at is null;
create index on projects (deleted_at) where deleted_at is not null;
create index on projects (source_template_id);
create index projects_media_ids_gin on projects using gin (media_ids);
create trigger projects_updated before update on projects
  for each row execute function set_updated_at();

-- Slide limit by plan: 10 free, 20 premium. Only checked when the count goes
-- up, so a user who cancels Premium keeps editing the 15-slide project they
-- already have. They just can't add slides.
create or replace function enforce_slide_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  growing boolean;
begin
  if tg_op = 'INSERT' then
    growing := true;
  else
    growing := new.slide_count > old.slide_count;
  end if;

  if growing and new.slide_count > max_slides(new.user_id) then
    raise exception 'slide limit reached for this plan'
      using errcode = 'P0001', hint = 'PREMIUM_REQUIRED';
  end if;
  return new;
end $$;

create trigger projects_slide_limit before insert or update of slide_count on projects
  for each row execute function enforce_slide_limit();

-- ---------------------------------------------------------------------------
-- media (uploaded photos and videos). Files live in a private bucket at
-- media/{user_id}/{id}.{ext}. The browser never reads the bucket directly;
-- the API checks ownership here, then hands out short-lived signed URLs.
-- ---------------------------------------------------------------------------

create table media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  status text not null default 'pending' check (status in ('pending','ready')),
  storage_path text not null,
  thumb_path text,
  mime_type text not null,
  bytes bigint not null check (bytes > 0),
  width integer,
  height integer,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on media (user_id, created_at desc);
create index on media (status, created_at);
create trigger media_updated before update on media
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table profiles       enable row level security;
alter table subscriptions  enable row level security;
alter table stripe_events  enable row level security;
alter table templates      enable row level security;
alter table template_docs  enable row level security;
alter table assets         enable row level security;
alter table projects       enable row level security;
alter table media          enable row level security;

-- profiles: own row only
create policy profiles_select on profiles for select using (id = auth.uid());
create policy profiles_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- subscriptions: read your own, no browser writes
create policy subscriptions_select on subscriptions for select
  using (user_id = auth.uid());

-- stripe_events: no policies, so only the service role can touch it

-- templates and assets: any signed-in user can read what's published
create policy templates_select on templates for select to authenticated
  using (status = 'published');
create policy assets_select on assets for select to authenticated
  using (is_active);

-- template_docs: premium templates only open for premium users
create policy template_docs_select on template_docs for select to authenticated
  using (exists (
    select 1 from templates t
    where t.id = template_docs.template_id
      and t.status = 'published'
      and (not t.is_premium or current_user_is_premium())
  ));

-- projects: own rows, including soft-deleted ones (the API filters them out)
create policy projects_select on projects for select using (user_id = auth.uid());
create policy projects_insert on projects for insert with check (user_id = auth.uid());
create policy projects_update on projects for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy projects_delete on projects for delete using (user_id = auth.uid());

-- media: own rows
create policy media_select on media for select using (user_id = auth.uid());
create policy media_insert on media for insert with check (user_id = auth.uid());
create policy media_update on media for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy media_delete on media for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- storage buckets
--   media     private, no storage.objects policies (default deny), signed URLs only
--   templates public read, staff write via service role
--   assets    public read, staff write via service role
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit) values
  ('media',     'media',     false, 209715200),  -- 200 MB per object
  ('templates', 'templates', true,  10485760),
  ('assets',    'assets',    true,  5242880)
on conflict (id) do nothing;
