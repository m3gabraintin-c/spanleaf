import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { as, freshDb, makePremium, mkUser, pgCode, type TestDb } from "./helpers";

let t: TestDb;
let alice: string;
let bob: string;
let aliceProject: string;
let aliceMedia: string;
const DOC = { v: 1, background: { type: "color", value: "#fff" }, elements: [] };
const TABLES = ["profiles", "subscriptions", "stripe_events", "templates", "template_docs", "assets", "projects", "media", "rate_limits", "job_runs"];

before(async () => {
  t = await freshDb("security");
  alice = await mkUser(t.sql, "alice@example.test");
  bob = await mkUser(t.sql, "bob@example.test");
  await makePremium(t.sql, alice);
  [{ id: aliceProject }] = await t.sql<{ id: string }[]>`
    insert into projects (user_id, title, format, doc) values (${alice}, 'Alice trip', 'square', ${t.sql.json(DOC)}) returning id`;
  [{ id: aliceMedia }] = await t.sql<{ id: string }[]>`select gen_random_uuid() as id`;
  await t.sql`insert into media (id, user_id, kind, status, storage_path, mime_type, bytes)
              values (${aliceMedia}, ${alice}, 'image', 'ready', ${alice + "/" + aliceMedia + ".png"}, 'image/png', 100)`;
});
after(() => t.close());

describe("the browser roles have no database access at all", () => {
  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} is refused on every table`, async () => {
      for (const table of TABLES) {
        const code = await pgCode(as(t.sql, role, alice, (tx) => tx.unsafe(`select 1 from public.${table} limit 1`)));
        assert.equal(code, "42501", `${role} could read ${table}`);
      }
    });
    it(`${role} cannot insert, update or delete`, async () => {
      assert.equal(await pgCode(as(t.sql, role, alice, (tx) => tx`delete from projects where id = ${aliceProject}`)), "42501");
      assert.equal(await pgCode(as(t.sql, role, alice, (tx) => tx`update projects set title = 'x' where id = ${aliceProject}`)), "42501");
      assert.equal(await pgCode(as(t.sql, role, alice, (tx) => tx`insert into projects (user_id, format, doc) values (${alice}, 'square', ${tx.json({})})`)), "42501");
    });
    it(`${role} cannot call the entitlement functions`, async () => {
      assert.equal(await pgCode(as(t.sql, role, alice, (tx) => tx`select current_user_is_premium()`)), "42501");
      assert.equal(await pgCode(as(t.sql, role, alice, (tx) => tx`select is_premium(${alice})`)), "42501");
    });
  }
  it("app_user cannot ask whether another user is premium", async () => {
    assert.equal(await pgCode(as(t.sql, "app_user", bob, (tx) => tx`select is_premium(${alice})`)), "42501");
    assert.equal(await pgCode(as(t.sql, "app_user", bob, (tx) => tx`select max_slides(${alice})`)), "42501");
  });
});

describe("a second user gets nothing back", () => {
  it("cannot see another user's rows", async () => {
    for (const q of [
      (tx: typeof t.sql) => tx`select id from projects`,
      (tx: typeof t.sql) => tx`select id from media`,
      (tx: typeof t.sql) => tx`select id from subscriptions`,
      (tx: typeof t.sql) => tx`select id from profiles where id = ${alice}`,
    ]) {
      const rows = await as(t.sql, "app_user", bob, (tx) => q(tx as unknown as typeof t.sql));
      assert.equal(rows.length, 0);
    }
  });
  it("cannot see even by guessing the id", async () => {
    const rows = await as(t.sql, "app_user", bob, (tx) => tx`select id from projects where id = ${aliceProject}`);
    assert.equal(rows.length, 0);
  });
  it("cannot update or delete another user's rows (zero rows affected)", async () => {
    const upd = await as(t.sql, "app_user", bob, (tx) => tx`update projects set title = 'hacked' where id = ${aliceProject}`);
    const del = await as(t.sql, "app_user", bob, (tx) => tx`delete from projects where id = ${aliceProject}`);
    const mdel = await as(t.sql, "app_user", bob, (tx) => tx`delete from media where id = ${aliceMedia}`);
    assert.equal(upd.count + del.count + mdel.count, 0);
    const [row] = await t.sql`select title from projects where id = ${aliceProject}`;
    assert.equal(row.title, "Alice trip");
  });
  it("cannot create rows in another user's name", async () => {
    const code = await pgCode(as(t.sql, "app_user", bob, (tx) => tx`insert into projects (user_id, format, doc) values (${alice}, 'square', ${tx.json({ v: 1 })})`));
    assert.equal(code, "42501");
  });
  it("cannot hand a project to another user", async () => {
    const [mine] = await as(t.sql, "app_user", bob, (tx) => tx`insert into projects (user_id, format, doc) values (${bob}, 'square', ${tx.json({ v: 1 })}) returning id`);
    const code = await pgCode(as(t.sql, "app_user", bob, (tx) => tx`update projects set user_id = ${alice} where id = ${mine.id}`));
    assert.equal(code, "42501");
  });
  it("with no signed-in user, app_user sees nothing", async () => {
    const rows = await as(t.sql, "app_user", null, (tx) => tx`select id from projects`);
    assert.equal(rows.length, 0);
  });
  it("a media row can't point into someone else's folder", async () => {
    const id = (await t.sql<{ id: string }[]>`select gen_random_uuid() as id`)[0].id;
    const code = await pgCode(
      as(t.sql, "app_user", bob, (tx) =>
        tx`insert into media (id, user_id, kind, storage_path, mime_type, bytes) values (${id}, ${bob}, 'image', ${alice + "/" + aliceMedia + ".png"}, 'image/png', 1)`,
      ),
    );
    assert.equal(code, "23514"); // check_violation: media_path_in_owner_folder
  });
});

describe("internal tables stay internal", () => {
  it("app_user cannot read or write stripe_events, rate_limits or job_runs", async () => {
    for (const table of ["stripe_events", "rate_limits", "job_runs"]) {
      assert.equal(await pgCode(as(t.sql, "app_user", alice, (tx) => tx.unsafe(`select 1 from public.${table}`))), "42501", table);
    }
  });
  it("app_user cannot write subscriptions", async () => {
    assert.equal(await pgCode(as(t.sql, "app_user", alice, (tx) => tx`update subscriptions set status = 'active'`)), "42501");
    assert.equal(await pgCode(as(t.sql, "app_user", bob, (tx) => tx`insert into subscriptions (user_id, stripe_customer_id, status) values (${bob}, 'cus_x', 'active')`)), "42501");
  });
  it("app_user cannot write templates, template_docs or assets", async () => {
    for (const table of ["templates", "template_docs", "assets"]) {
      assert.equal(await pgCode(as(t.sql, "app_user", alice, (tx) => tx.unsafe(`delete from public.${table}`))), "42501", table);
    }
  });
});

describe("premium templates", () => {
  let freeT: string;
  let premT: string;
  before(async () => {
    [{ id: freeT }] = await t.sql<{ id: string }[]>`insert into templates (slug, title, style_tag, format, slide_count, is_premium, status) values ('free-1','Free one','minimal','square',3,false,'published') returning id`;
    [{ id: premT }] = await t.sql<{ id: string }[]>`insert into templates (slug, title, style_tag, format, slide_count, is_premium, status) values ('prem-1','Premium one','retro','square',3,true,'published') returning id`;
    await t.sql`insert into templates (slug, title, style_tag, format, slide_count, status) values ('draft-1','Draft','x','square',1,'draft')`;
    await t.sql`insert into template_docs (template_id, doc) select id, ${t.sql.json(DOC)} from templates`;
  });
  it("everyone sees the card for every published template, never drafts", async () => {
    const rows = await as(t.sql, "app_user", bob, (tx) => tx`select slug from templates order by slug`);
    assert.deepEqual(rows.map((r) => r.slug), ["free-1", "prem-1"]);
  });
  it("a free user can open a free template's document but not a premium one", async () => {
    const docs = await as(t.sql, "app_user", bob, (tx) => tx`select template_id from template_docs`);
    assert.deepEqual(docs.map((d) => d.template_id), [freeT]);
  });
  it("a premium user can open both", async () => {
    const docs = await as(t.sql, "app_user", alice, (tx) => tx`select template_id from template_docs order by template_id`);
    assert.deepEqual(docs.map((d) => d.template_id).sort(), [freeT, premT].sort());
  });
  it("a premium user whose plan lapsed loses access straight away", async () => {
    await t.sql`update subscriptions set status = 'canceled' where user_id = ${alice}`;
    const docs = await as(t.sql, "app_user", alice, (tx) => tx`select template_id from template_docs`);
    assert.deepEqual(docs.map((d) => d.template_id), [freeT]);
    await makePremium(t.sql, alice);
  });
  it("a plan whose period has ended doesn't count even if the webhook hasn't arrived", async () => {
    await makePremium(t.sql, alice, "active", -2);
    const [{ p }] = await as(t.sql, "app_user", alice, (tx) => tx`select current_user_is_premium() as p`);
    assert.equal(p, false);
    await makePremium(t.sql, alice);
  });
});

describe("slide limit", () => {
  const make = (user: string, n: number) =>
    as(t.sql, "app_user", user, (tx) => tx`insert into projects (user_id, format, slide_count, doc) values (${user}, 'square', ${n}, ${tx.json(DOC)}) returning id`);

  it("free: 10 slides is fine, 11 is refused with a hint the API understands", async () => {
    assert.equal(await pgCode(make(bob, 10)), null);
    const err = await make(bob, 11).catch((e) => e);
    assert.equal(err.code, "P0001");
    assert.equal(err.hint, "PREMIUM_REQUIRED");
  });
  it("premium: 20 is fine", async () => {
    assert.equal(await pgCode(make(alice, 20)), null);
  });
  it("nobody gets 21, whichever rule catches it first (the trigger or the table constraint)", async () => {
    const code = await pgCode(make(alice, 21));
    assert.ok(code === "P0001" || code === "23514", `got ${code}`);
  });
  it("growing a free project past 10 is refused", async () => {
    const [p] = await make(bob, 9);
    assert.equal(await pgCode(as(t.sql, "app_user", bob, (tx) => tx`update projects set slide_count = 11 where id = ${p.id}`)), "P0001");
    assert.equal(await pgCode(as(t.sql, "app_user", bob, (tx) => tx`update projects set slide_count = 10 where id = ${p.id}`)), null);
  });
  it("after a downgrade, a 15 slide project stays editable but can't grow", async () => {
    await t.sql`update subscriptions set status = 'canceled' where user_id = ${alice}`;
    const [p] = await as(t.sql, "app_user", alice, (tx) => tx`select id from projects where slide_count = 20 limit 1`);
    assert.equal(await pgCode(as(t.sql, "app_user", alice, (tx) => tx`update projects set title = 'still editable', slide_count = 20 where id = ${p.id}`)), null);
    assert.equal(await pgCode(as(t.sql, "app_user", alice, (tx) => tx`update projects set slide_count = 15 where id = ${p.id}`)), null, "shrinking is allowed");
    assert.equal(await pgCode(as(t.sql, "app_user", alice, (tx) => tx`update projects set slide_count = 16 where id = ${p.id}`)), "P0001", "growing is not");
    await makePremium(t.sql, alice);
  });
});

describe("storage buckets", () => {
  it("the photo bucket is private, capped at 25 MB, and only takes JPEG, PNG and WebP", async () => {
    const [b] = await t.sql`select public, file_size_limit::int as lim, allowed_mime_types from storage.buckets where id = 'media'`;
    assert.equal(b.public, false);
    assert.equal(b.lim, 25 * 1024 * 1024);
    assert.deepEqual([...b.allowed_mime_types].sort(), ["image/jpeg", "image/png", "image/webp"]);
  });
  it("template and sticker buckets are public-read, small, and separate from user photos", async () => {
    const rows = await t.sql`select id, public from storage.buckets where id in ('templates','assets') order by id`;
    assert.deepEqual(rows.map((r) => [r.id, r.public]), [["assets", true], ["templates", true]]);
  });
});

describe("migrations", () => {
  it("leave anon and authenticated with zero grants anywhere in public", async () => {
    const [{ n }] = await t.sql<{ n: string }[]>`
      select count(*)::text as n from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated')`;
    assert.equal(n, "0");
    const [{ f }] = await t.sql<{ f: string }[]>`
      select count(*)::text as f from information_schema.routine_privileges where routine_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')`;
    assert.equal(f, "0");
  });
  it("tables created later are locked the same way (default privileges)", async () => {
    await t.sql`create table public.future_table (id int)`;
    const [{ n }] = await t.sql<{ n: string }[]>`select count(*)::text as n from information_schema.role_table_grants where table_name = 'future_table' and grantee in ('anon','authenticated')`;
    assert.equal(n, "0");
    await t.sql`drop table public.future_table`;
  });
  it("every public table has row level security on", async () => {
    const rows = await t.sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and not rowsecurity and tablename <> '_migrations'`;
    assert.equal(rows.length, 0);
  });
});
