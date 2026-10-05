import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { accountDeletion, mediaCleanup, runJob, stripeReconcile, trashPurge } from "@/server/jobs";
import { MEDIA_BUCKET } from "@/server/media";
import { rateLimit } from "@/server/rateLimit";
import { apiCode, FakeAuthAdmin, FakeStorage, FakeStripe, freshDb, mkUser, snap, type TestDb } from "./helpers";

let t: TestDb;
let alice: string;
let storage: FakeStorage;
const DOC = { v: 1, background: { type: "color", value: "#fff" }, elements: [] };

async function addMedia(user: string, opts: { status?: "pending" | "ready"; ageDays?: number } = {}) {
  const id = randomUUID();
  const path = `${user}/${id}.png`;
  const thumb = `${user}/${id}.thumb.png`;
  await t.sql`insert into media (id,user_id,kind,status,storage_path,thumb_path,mime_type,bytes,created_at)
              values (${id},${user},'image',${opts.status ?? "ready"},${path},${thumb},'image/png',10, now() - ${(opts.ageDays ?? 0) + " days"}::interval)`;
  storage.put(MEDIA_BUCKET, path);
  storage.put(MEDIA_BUCKET, thumb);
  return id;
}
const exists = async (id: string) => (await t.sql`select count(*)::int as n from media where id = ${id}`)[0].n === 1;

before(async () => {
  t = await freshDb("jobs");
  alice = await mkUser(t.sql, "alice@example.test");
});
after(() => t.close());
const fresh = () => {
  storage = new FakeStorage();
};
fresh();

describe("media cleanup", () => {
  it("removes uploads that never finished (older than a day) and keeps recent ones", async () => {
    fresh();
    const stale = await addMedia(alice, { status: "pending", ageDays: 2 });
    const recent = await addMedia(alice, { status: "pending", ageDays: 0 });
    const r = await mediaCleanup(t.db, storage);
    assert.equal(await exists(stale), false);
    assert.equal(await exists(recent), true);
    assert.equal(r.stats.removed, 1);
    assert.equal(storage.removed.length, 2, "the file and its thumbnail");
  });
  it("removes unused photos after 7 days, but never ones a project uses, trashed or not", async () => {
    fresh();
    const unused = await addMedia(alice, { ageDays: 8 });
    const used = await addMedia(alice, { ageDays: 40 });
    const trashed = await addMedia(alice, { ageDays: 40 });
    const young = await addMedia(alice, { ageDays: 3 });
    await t.sql`insert into projects (user_id, format, doc, media_ids) values (${alice}, 'square', ${t.sql.json(DOC)}, ${`{${used}}`}::uuid[])`;
    await t.sql`insert into projects (user_id, format, doc, media_ids, deleted_at) values (${alice}, 'square', ${t.sql.json(DOC)}, ${`{${trashed}}`}::uuid[], now())`;
    await mediaCleanup(t.db, storage);
    assert.deepEqual([await exists(unused), await exists(used), await exists(trashed), await exists(young)], [false, true, true, true]);
  });
  it("if storage fails, the rows stay (so the next run retries) and the failure is reported", async () => {
    fresh();
    const id = await addMedia(alice, { status: "pending", ageDays: 3 });
    storage.failRemove = true;
    const r = await mediaCleanup(t.db, storage);
    assert.equal(await exists(id), true);
    assert.equal(r.errors.length, 1);
    storage.failRemove = false;
    assert.equal((await mediaCleanup(t.db, storage)).errors.length, 0);
    assert.equal(await exists(id), false);
  });
});

describe("trash purge", () => {
  it("deletes projects trashed more than 30 days ago and nothing else", async () => {
    const old = (await t.sql`insert into projects (user_id,format,doc,deleted_at) values (${alice},'square',${t.sql.json(DOC)}, now() - interval '31 days') returning id`)[0].id;
    const recent = (await t.sql`insert into projects (user_id,format,doc,deleted_at) values (${alice},'square',${t.sql.json(DOC)}, now() - interval '5 days') returning id`)[0].id;
    const live = (await t.sql`insert into projects (user_id,format,doc) values (${alice},'square',${t.sql.json(DOC)}) returning id`)[0].id;
    const r = await trashPurge(t.db);
    const left = (await t.sql`select id from projects where id in ${t.sql([old, recent, live])}`).map((x) => x.id);
    assert.deepEqual(left.sort(), [recent, live].sort());
    assert.equal(r.stats.projects, 1);
  });
  it("also tidies old counters, job logs and processed webhook events", async () => {
    await t.sql`insert into rate_limits (key, window_start, count) values ('old', now() - interval '3 days', 5), ('new', now(), 1)`;
    await t.sql`insert into stripe_events (id,type,received_at,processed_at) values ('evt_old','x', now() - interval '100 days', now() - interval '100 days'), ('evt_unprocessed','x', now() - interval '100 days', null)`;
    await trashPurge(t.db);
    assert.deepEqual((await t.sql`select key from rate_limits`).map((r) => r.key), ["new"]);
    assert.deepEqual((await t.sql`select id from stripe_events`).map((r) => r.id), ["evt_unprocessed"], "an event that never finished is kept for a human to look at");
  });
});

describe("stripe reconcile", () => {
  it("re-checks subscriptions that look active but ran past their period, and fixes them", async () => {
    const u = await mkUser(t.sql, "stale@example.test");
    await t.sql`insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
                values (${u}, 'cus_stale', 'sub_stale', 'active', now() - interval '3 days')`;
    const stripe = new FakeStripe();
    stripe.subs.set("sub_stale", snap({ id: "sub_stale", customerId: "cus_stale", status: "canceled", userId: u }));
    const r = await stripeReconcile(t.db, stripe);
    assert.equal(r.stats.refreshed, 1);
    assert.equal((await t.sql`select status from subscriptions where user_id = ${u}`)[0].status, "canceled");
  });
  it("leaves healthy subscriptions alone", async () => {
    const u = await mkUser(t.sql, "healthy@example.test");
    await t.sql`insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
                values (${u}, 'cus_ok', 'sub_ok', 'active', now() + interval '10 days')`;
    const stripe = new FakeStripe();
    await stripeReconcile(t.db, stripe);
    assert.equal(stripe.retrieveCalls, 0);
  });
});

describe("account deletion", () => {
  it("removes the files and the sign-in, and everything else follows by cascade", async () => {
    fresh();
    const u = await mkUser(t.sql, "bye@example.test");
    await addMedia(u);
    await addMedia(u);
    const other = await mkUser(t.sql, "stays@example.test");
    const keep = await addMedia(other);
    await t.sql`insert into projects (user_id,format,doc) values (${u},'square',${t.sql.json(DOC)}), (${other},'square',${t.sql.json(DOC)})`;
    await t.sql`insert into subscriptions (user_id, stripe_customer_id, status) values (${u}, 'cus_bye', 'canceled')`;
    await t.sql`update profiles set deletion_requested_at = now() where id = ${u}`;

    const r = await accountDeletion(t.db, storage, new FakeAuthAdmin(t.sql));
    assert.equal(r.stats.deleted, 1);
    for (const table of ["auth.users", "profiles", "projects", "media", "subscriptions"]) {
      const col = table === "auth.users" || table === "profiles" ? "id" : "user_id";
      const [{ n }] = await t.sql.unsafe(`select count(*)::int as n from ${table} where ${col} = '${u}'`);
      assert.equal(n, 0, `${table} still has rows for the deleted user`);
    }
    assert.equal([...storage.files.keys()].filter((k) => k.includes(`/${u}/`)).length, 0);
    assert.equal(await exists(keep), true, "other users' data is untouched");
    assert.equal((await t.sql`select count(*)::int as n from projects where user_id = ${other}`)[0].n, 1);
  });
  it("one failure doesn't stop the others, and the failed user is retried next run", async () => {
    fresh();
    const a = await mkUser(t.sql, "fail-a@example.test");
    const b = await mkUser(t.sql, "ok-b@example.test");
    await t.sql`update profiles set deletion_requested_at = now() where id in ${t.sql([a, b])}`;
    const admin = new FakeAuthAdmin(t.sql);
    admin.failFor.add(a);
    const r1 = await accountDeletion(t.db, storage, admin);
    assert.equal(r1.stats.deleted, 1);
    assert.equal(r1.errors.length, 1);
    assert.equal((await t.sql`select count(*)::int as n from auth.users where id = ${b}`)[0].n, 0);
    assert.equal((await t.sql`select count(*)::int as n from auth.users where id = ${a}`)[0].n, 1);
    admin.failFor.clear();
    const r2 = await accountDeletion(t.db, storage, admin);
    assert.equal(r2.stats.deleted, 1);
    assert.equal((await t.sql`select count(*)::int as n from auth.users where id = ${a}`)[0].n, 0);
  });
  it("people who didn't ask are never touched", async () => {
    fresh();
    const u = await mkUser(t.sql, "fine@example.test");
    await accountDeletion(t.db, storage, new FakeAuthAdmin(t.sql));
    assert.equal((await t.sql`select count(*)::int as n from auth.users where id = ${u}`)[0].n, 1);
  });
});

describe("job log", () => {
  it("records a successful run with its numbers", async () => {
    const r = await runJob(t.db, "demo-ok", async () => ({ stats: { things: 3 }, errors: [] }));
    assert.equal(r.ok, true);
    const [row] = await t.sql`select ok, stats, finished_at from job_runs where job = 'demo-ok'`;
    assert.equal(row.ok, true);
    assert.deepEqual(row.stats, { things: 3 }, "stats are stored as a JSON object");
    assert.ok(row.finished_at);
  });
  it("records a crash as a failed run instead of throwing", async () => {
    const r = await runJob(t.db, "demo-crash", async () => {
      throw new Error("secret detail with an email a@b.test");
    });
    assert.equal(r.ok, false);
    const [row] = await t.sql`select ok, errors from job_runs where job = 'demo-crash'`;
    assert.equal(row.ok, false);
    assert.ok(!JSON.stringify(row.errors).includes("a@b.test"), "the error message itself isn't logged");
  });
});

describe("rate limit", () => {
  it("allows the limit, then refuses with a retry time", async () => {
    for (let i = 0; i < 3; i++) await rateLimit(t.db, "demo", alice, 3, 60);
    const err = await rateLimit(t.db, "demo", alice, 3, 60).catch((e) => e);
    assert.equal(err.code, "RATE_LIMITED");
    assert.equal(err.status, 429);
    assert.ok(err.retryAfter >= 1 && err.retryAfter <= 60);
  });
  it("counts each user and each route separately", async () => {
    const bob = await mkUser(t.sql, "bob@example.test");
    assert.equal(await apiCode(rateLimit(t.db, "demo", bob, 3, 60)), null);
    assert.equal(await apiCode(rateLimit(t.db, "other-route", alice, 3, 60)), null);
  });
  it("starts fresh in the next window", async () => {
    for (let i = 0; i < 2; i++) await rateLimit(t.db, "short", alice, 2, 1);
    assert.equal(await apiCode(rateLimit(t.db, "short", alice, 2, 1)), "RATE_LIMITED");
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(await apiCode(rateLimit(t.db, "short", alice, 2, 1)), null);
  });
  it("is exact under a burst of simultaneous requests", async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => rateLimit(t.db, "burst", alice, 5, 60)));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  });
});
