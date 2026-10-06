-- Everyone gets everything. There are no plans, no subscriptions and no payments.
-- Written 2026-10-05. Safe to run on a database that already ran 0001 and 0002.
--
-- This removes:
--   - the slide limit by plan (trigger and the functions it used)
--   - the premium check and the table of subscriptions and Stripe events
--   - the database templates and assets, which nothing in the app reads. Starter layouts are made in code now.
-- and raises the slide limit to a ceiling that only keeps a project loadable.

-- 1. No slide limit by plan.
drop trigger if exists projects_slide_limit on projects;
drop function if exists enforce_slide_limit();

-- 2. Template tables go. Their policies and the column that points at them go with them.
alter table projects drop column if exists source_template_id;
drop table if exists template_docs;
drop table if exists templates;
drop table if exists assets;

-- 3. The premium check, then the tables it read.
drop function if exists current_user_is_premium();
drop function if exists max_slides(uuid);
drop function if exists is_premium(uuid);
drop table if exists stripe_events;
drop table if exists subscriptions;

-- 4. The ceiling on slides: 500.
alter table projects drop constraint if exists projects_slide_count_check;
alter table projects add constraint projects_slide_count_check check (slide_count between 1 and 500);

-- 5. The buckets only the removed tables used. Skipped quietly if a bucket still holds files, so nothing is lost.
do $$
begin
  delete from storage.buckets where id in ('templates', 'assets');
exception when others then
  raise notice 'left the templates and assets buckets in place: %', sqlerrm;
end $$;
