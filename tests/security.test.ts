import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { as, freshDb, mkUser, pgCode, type TestDb } from "./helpers";

let t: TestDb;
let alice: string;
let bob: string;
let aliceProject: string;
let aliceMedia: string;
const DOC = { v: 1, background: { type: "color", value: "#fff" }, elements: [] };
const TABLES = ["profiles", "projects", "media", "rate_limits", "job_runs"];

before(async () => {
  t = await freshDb("security");
  alice = await mkUser(t.sql, "alice@example.test");
  bob = await mkUser(t.sql, "bob@example.test");
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
  }
});

describe("a second user gets nothing back", () => {
  it("cannot see another user's rows", async () => {
    for (const q of [
      (tx: typeof t.sql) => tx`select id from projects`,
      (tx: typeof t.sql) => tx`select id from media`,
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
  it("app_user cannot read or write rate_limits or job_runs", async () => {
    for (const table of ["rate_limits", "job_runs"]) {
      assert.equal(await pgCode(as(t.sql, "app_user", alice, (tx) => tx.unsafe(`select 1 from public.${table}`))), "42501", table);
    }
  });
  it("the plan, billing and template tables and functions are gone", async () => {
    const tables = await t.sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' order by tablename`;
    assert.deepEqual(tables.map((r) => r.tablename).filter((n) => n !== "_migrations"), ["job_runs", "media", "profiles", "projects", "rate_limits"]);
    const fns = await t.sql<{ proname: string }[]>`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('is_premium', 'current_user_is_premium', 'max_slides', 'enforce_slide_limit')`;
    assert.equal(fns.length, 0);
    const cols = await t.sql`select 1 from information_schema.columns where table_name = 'projects' and column_name = 'source_template_id'`;
    assert.equal(cols.length, 0);
  });
});

describe("slide count", () => {
  const make = (user: string, n: number) =>
    as(t.sql, "app_user", user, (tx) => tx`insert into projects (user_id, format, slide_count, doc) values (${user}, 'square', ${n}, ${tx.json(DOC)}) returning id`);

  it("anyone can have any number of slides from 1 to 500", async () => {
    for (const n of [1, 10, 11, 20, 21, 499, 500]) assert.equal(await pgCode(make(bob, n)), null, `${n}`);
  });
  it("0 and 501 are refused by the table's own check", async () => {
    assert.equal(await pgCode(make(bob, 0)), "23514");
    assert.equal(await pgCode(make(bob, 501)), "23514");
  });
  it("a project can grow and shrink freely, up to the ceiling", async () => {
    const [p] = await make(bob, 9);
    for (const n of [10, 11, 200, 500, 3]) assert.equal(await pgCode(as(t.sql, "app_user", bob, (tx) => tx`update projects set slide_count = ${n} where id = ${p.id}`)), null, `${n}`);
    assert.equal(await pgCode(as(t.sql, "app_user", bob, (tx) => tx`update projects set slide_count = 501 where id = ${p.id}`)), "23514");
  });
});

describe("storage buckets", () => {
  it("the photo bucket is private, capped at 25 MB, and only takes JPEG, PNG and WebP", async () => {
    const [b] = await t.sql`select public, file_size_limit::int as lim, allowed_mime_types from storage.buckets where id = 'media'`;
    assert.equal(b.public, false);
    assert.equal(b.lim, 25 * 1024 * 1024);
    assert.deepEqual([...b.allowed_mime_types].sort(), ["image/jpeg", "image/png", "image/webp"]);
  });
  it("the template and sticker buckets are gone, since nothing uses them", async () => {
    const rows = await t.sql`select id from storage.buckets where id in ('templates','assets')`;
    assert.equal(rows.length, 0);
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
