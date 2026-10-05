import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { makeUserRoute } from "@/server/http";
import { createProject, getProject, listProjects, patchProject, trashProject } from "@/server/projects";
import { createProjectInput, listProjectsInput, patchProjectInput } from "@/server/schemas";
import { freshDb, mkUser, type TestDb } from "./helpers";

let t: TestDb;
let alice: string;
let bob: string;
let current: { id: string; email?: string } | null = null;

// The same wrapper the real routes use, with a fixed "signed in" user and the test database.
const userRoute = makeUserRoute({ getUser: async () => current, getDb: () => t.db });

const list = userRoute({ name: "projects.list", input: listProjectsInput }, ({ user, db, input }) => listProjects(db, user.id, input));
const create = userRoute({ name: "projects.create", input: createProjectInput }, async ({ user, db, input }) => ({
  project: await createProject(db, user.id, input),
}));
// A separate route with a tight limit, so the rate limit tests don't use up the others' allowance.
const limitedCreate = userRoute({ name: "projects.create.limited", input: createProjectInput, limit: { max: 3, windowSec: 60 } }, async ({ user, db, input }) => ({
  project: await createProject(db, user.id, input),
}));
const get = userRoute({ name: "projects.get" }, async ({ user, db, params }) => ({ project: await getProject(db, user.id, params.id) }));
const patch = userRoute({ name: "projects.patch", input: patchProjectInput }, ({ user, db, params, input }) => patchProject(db, user.id, params.id, input));
const trash = userRoute({ name: "projects.delete" }, ({ user, db, params }) => trashProject(db, user.id, params.id));
const boom = userRoute({ name: "boom" }, async () => {
  throw new Error("secret detail: alice@example.test and sk_live_abc123");
});
const deletion = userRoute({ name: "me.delete", allowDeleting: true }, async () => ({ ok: true }));

const post = (body: unknown, raw?: string) =>
  new Request("http://x.test/api", { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });
const getReq = (qs = "") => new Request(`http://x.test/api${qs}`, { method: "GET" });
const patchReq = (body: unknown) => new Request("http://x.test/api", { method: "PATCH", body: JSON.stringify(body) });
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonOf = async (r: Response) => ({ status: r.status, body: await r.json(), headers: r.headers });

before(async () => {
  t = await freshDb("routes");
  alice = await mkUser(t.sql, "alice@example.test");
  bob = await mkUser(t.sql, "bob@example.test");
});
after(() => t.close());

describe("authentication and the one error shape", () => {
  it("no session: 401 UNAUTHENTICATED, in the standard shape, and never cached", async () => {
    current = null;
    const r = await jsonOf(await list(getReq()));
    assert.equal(r.status, 401);
    assert.deepEqual(Object.keys(r.body), ["error"]);
    assert.equal(r.body.error.code, "UNAUTHENTICATED");
    assert.ok(r.headers.get("cache-control")?.includes("no-store"));
  });
  it("the first request from a new user creates their profile row", async () => {
    const carol = await mkUser(t.sql, "carol@example.test");
    await t.sql`delete from profiles where id = ${carol}`;
    current = { id: carol };
    await list(getReq());
    assert.equal((await t.sql`select count(*)::int as n from profiles where id = ${carol}`)[0].n, 1);
  });
});

describe("reading the request", () => {
  before(() => {
    current = { id: alice };
  });
  it("invalid JSON is a 400, not a crash", async () => {
    const r = await jsonOf(await create(post(null, "{not json")));
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "INVALID");
    assert.match(r.body.error.message, /valid JSON/);
  });
  it("a body over 3 MB is refused", async () => {
    const r = await jsonOf(await create(post(null, JSON.stringify({ title: "x".repeat(3 * 1024 * 1024 + 10) }))));
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /too large/);
  });
  it("wrong types are named by field and the value is never echoed back", async () => {
    const id = randomUUID();
    const r = await jsonOf(await patch(patchReq({ rev: "hunter2-secret-value", title: 12345 }), withId(id)));
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /rev/);
    assert.match(r.body.error.message, /title/);
    assert.ok(!JSON.stringify(r.body).includes("hunter2-secret-value"));
  });
  it("a document that doesn't match the schema is refused before it reaches the database", async () => {
    const p = (await (await create(post({}))).json()).project;
    const bad = { rev: 0, doc: { v: 2, background: { type: "color", value: "#fff" }, elements: [] } };
    assert.equal((await patch(patchReq(bad), withId(p.id))).status, 400);
    const tooMany = { rev: 0, doc: { v: 1, background: { type: "color", value: "#fff" }, elements: Array.from({ length: 501 }, (_, i) => ({ id: `e${i}`, type: "image", x: 0, y: 0, w: 1, h: 1 })) } };
    assert.equal((await patch(patchReq(tooMany), withId(p.id))).status, 400);
    const negative = { rev: 0, doc: { v: 1, background: { type: "color", value: "#fff" }, elements: [{ id: "a", type: "image", x: 0, y: 0, w: -5, h: 1 }] } };
    assert.equal((await patch(patchReq(negative), withId(p.id))).status, 400);
  });
  it("query strings are validated too: a limit of 1000, or text, is a 400", async () => {
    assert.equal((await list(getReq("?limit=1000"))).status, 400);
    assert.equal((await list(getReq("?limit=abc"))).status, 400);
    assert.equal((await list(getReq("?limit=5"))).status, 200);
  });
  it("unknown fields are dropped, not stored or reflected", async () => {
    const r = await create(post({ title: "ok", user_id: bob, isAdmin: true, deleted_at: "2020-01-01" }));
    const p = (await r.json()).project;
    const [row] = await t.sql`select user_id, deleted_at from projects where id = ${p.id}`;
    assert.equal(row.user_id, alice, "a client can't choose the owner");
    assert.equal(row.deleted_at, null);
  });
});

describe("two people through the routes", () => {
  it("what Alice makes, Bob can't read, change or delete, and each gets a plain 404", async () => {
    current = { id: alice };
    const made = await jsonOf(await create(post({ title: "Alice only" })));
    const id = made.body.project.id;
    current = { id: bob };
    assert.equal((await get(getReq(), withId(id))).status, 404);
    assert.equal((await patch(patchReq({ rev: 0, title: "stolen" }), withId(id))).status, 404);
    assert.equal((await trash(new Request("http://x.test", { method: "DELETE" }), withId(id))).status, 404);
    const bobsList = await jsonOf(await list(getReq()));
    assert.ok(!bobsList.body.items.some((p: { id: string }) => p.id === id));
    current = { id: alice };
    assert.equal((await jsonOf(await get(getReq(), withId(id)))).body.project.title, "Alice only");
  });
  it("a stale save over HTTP is a 409 with the conflict code, and the newer data survives", async () => {
    current = { id: alice };
    const id = (await (await create(post({ title: "Race" }))).json()).project.id;
    const ok = await jsonOf(await patch(patchReq({ rev: 0, title: "first" }), withId(id)));
    assert.equal(ok.body.rev, 1);
    const stale = await jsonOf(await patch(patchReq({ rev: 0, title: "second" }), withId(id)));
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "REV_CONFLICT");
    assert.equal((await jsonOf(await get(getReq(), withId(id)))).body.project.title, "first");
  });
  it("a malformed id in the address is a 404", async () => {
    current = { id: alice };
    assert.equal((await get(getReq(), withId("not-a-uuid"))).status, 404);
    assert.equal((await get(getReq(), withId("1; drop table projects"))).status, 404);
  });
});

describe("limits and failures", () => {
  it("rate limit: the 4th request in a window is 429 with Retry-After", async () => {
    const dave = await mkUser(t.sql, "dave@example.test");
    current = { id: dave };
    for (let i = 0; i < 3; i++) assert.equal((await limitedCreate(post({}))).status, 200);
    const r = await limitedCreate(post({}));
    assert.equal(r.status, 429);
    assert.equal((await r.json()).error.code, "RATE_LIMITED");
    assert.ok(Number(r.headers.get("retry-after")) >= 1);
  });
  it("one person's limit doesn't slow another", async () => {
    const erin = await mkUser(t.sql, "erin@example.test");
    current = { id: erin };
    assert.equal((await limitedCreate(post({}))).status, 200);
  });
  it("a project over the plan's slide limit is a clean 403, not a database error", async () => {
    const fay = await mkUser(t.sql, "fay@example.test");
    current = { id: fay };
    const r = await jsonOf(await create(post({ slideCount: 11 })));
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "LIMIT_REACHED");
  });
  it("an account being deleted is refused everywhere except the deletion route", async () => {
    const gus = await mkUser(t.sql, "gus@example.test");
    await t.sql`insert into profiles (id, deletion_requested_at) values (${gus}, now()) on conflict (id) do update set deletion_requested_at = now()`;
    current = { id: gus };
    const r = await jsonOf(await list(getReq()));
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "ACCOUNT_DELETING");
    assert.equal((await deletion(post({}))).status, 200);
  });
  it("an unexpected crash is a generic 500, and neither the response nor the log carries the details", async () => {
    current = { id: alice };
    const logged: string[] = [];
    const spy = mock.method(console, "error", (...a: unknown[]) => void logged.push(JSON.stringify(a)));
    const res = await boom(getReq());
    spy.mock.restore();
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.error.code, "INTERNAL");
    assert.ok(!JSON.stringify(body).includes("alice@example.test") && !JSON.stringify(body).includes("sk_live"));
    assert.equal(logged.length, 1);
    assert.ok(!logged[0].includes("alice@example.test") && !logged[0].includes("sk_live"), "the log must not contain the error text");
  });
  it("a database failure mid-request is a 500 and doesn't take the next request down", async () => {
    current = { id: alice };
    const bad = userRoute({ name: "bad-sql" }, ({ db }) => db.asService((tx) => tx`select * from table_that_does_not_exist`));
    const spy = mock.method(console, "error", () => {});
    assert.equal((await bad(getReq())).status, 500);
    spy.mock.restore();
    assert.equal((await list(getReq())).status, 200);
  });
});
