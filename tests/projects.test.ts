import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { createProject, duplicateProject, getProject, listProjects, patchProject, restoreProject, trashProject } from "@/server/projects";
import { apiCode, freshDb, mkUser, type TestDb } from "./helpers";

let t: TestDb;
let alice: string;
let bob: string;
const doc = (elements: unknown[] = []) => ({ v: 1 as const, background: { type: "color" as const, value: "#ffffff" }, elements: elements as never });
const image = (mediaId?: string) => ({ id: randomUUID(), type: "image" as const, x: 10, y: 20, w: 300, h: 200, rotation: 0, locked: false, mediaId });

before(async () => {
  t = await freshDb("projects");
  alice = await mkUser(t.sql, "alice@example.test");
  bob = await mkUser(t.sql, "bob@example.test");
});
after(() => t.close());

describe("create and read", () => {
  it("creates a blank project with defaults and a stored document that is an object", async () => {
    const p = await createProject(t.db, alice, {});
    assert.equal(p.title, "Untitled");
    assert.equal(p.format, "portrait_4_5");
    assert.equal(p.slideCount, 3);
    assert.equal(p.rev, 0);
    const [row] = await t.sql`select jsonb_typeof(doc) as t from projects where id = ${p.id}`;
    assert.equal(row.t, "object", "the document must be stored as a JSON object, not a JSON string");
  });
  it("reads back exactly what was saved", async () => {
    const p = await createProject(t.db, alice, { title: "  Trip  ", format: "square", slideCount: 5 });
    const got = await getProject(t.db, alice, p.id);
    assert.equal(got.title, "Trip");
    assert.equal(got.format, "square");
    assert.equal(got.slideCount, 5);
    assert.deepEqual(got.doc, { v: 1, background: { type: "color", value: "#ffffff" }, elements: [] });
  });
  it("another user sees NOT_FOUND, not forbidden, so ids can't be probed", async () => {
    const p = await createProject(t.db, alice, {});
    assert.equal(await apiCode(getProject(t.db, bob, p.id)), "NOT_FOUND");
  });
  it("a malformed id is NOT_FOUND, not a database error", async () => {
    assert.equal(await apiCode(getProject(t.db, alice, "not-a-uuid")), "NOT_FOUND");
    assert.equal(await apiCode(getProject(t.db, alice, randomUUID())), "NOT_FOUND");
  });
  it("has no limit by plan: any number of slides from 1 to 500", async () => {
    for (const n of [1, 11, 20, 21, 500]) assert.equal((await createProject(t.db, bob, { slideCount: n })).slideCount, n);
  });
  it("refuses a slide count past the ceiling of 500", async () => {
    await assert.rejects(createProject(t.db, bob, { slideCount: 501 }));
  });
  it("a project can grow slide by slide, a long way, and shrink again", async () => {
    const p = await createProject(t.db, bob, { slideCount: 3 });
    let rev = p.rev;
    for (const n of [4, 25, 140, 500, 60]) {
      rev = (await patchProject(t.db, bob, p.id, { rev, slideCount: n })).rev;
      assert.equal((await getProject(t.db, bob, p.id)).slideCount, n);
    }
  });
});

describe("autosave (patch)", () => {
  it("saves, bumps the revision, and stores the document", async () => {
    const p = await createProject(t.db, bob, {});
    const r1 = await patchProject(t.db, bob, p.id, { rev: 0, doc: doc([image()]) });
    assert.equal(r1.rev, 1);
    const r2 = await patchProject(t.db, bob, p.id, { rev: 1, title: "Renamed" });
    assert.equal(r2.rev, 2);
    const got = await getProject(t.db, bob, p.id);
    assert.equal(got.title, "Renamed");
    assert.equal(got.doc.elements.length, 1, "a title-only save must not wipe the document");
  });
  it("a stale revision is refused with REV_CONFLICT and changes nothing", async () => {
    const p = await createProject(t.db, bob, {});
    await patchProject(t.db, bob, p.id, { rev: 0, doc: doc([image()]) });
    assert.equal(await apiCode(patchProject(t.db, bob, p.id, { rev: 0, doc: doc() })), "REV_CONFLICT");
    assert.equal((await getProject(t.db, bob, p.id)).doc.elements.length, 1);
  });
  it("two saves with the same revision at the same instant: exactly one wins", async () => {
    const p = await createProject(t.db, bob, {});
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => patchProject(t.db, bob, p.id, { rev: 0, title: `writer ${i}` })),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected" && (r.reason as { code: string }).code === "REV_CONFLICT").length, 7);
    assert.equal((await getProject(t.db, bob, p.id)).rev, 1);
  });
  it("saving someone else's project is NOT_FOUND, never a conflict or a success", async () => {
    const p = await createProject(t.db, alice, {});
    assert.equal(await apiCode(patchProject(t.db, bob, p.id, { rev: 0, title: "mine now" })), "NOT_FOUND");
    assert.equal((await getProject(t.db, alice, p.id)).title, "Untitled");
  });
  it("a project in the trash can't be saved to", async () => {
    const p = await createProject(t.db, bob, {});
    await trashProject(t.db, bob, p.id);
    assert.equal(await apiCode(patchProject(t.db, bob, p.id, { rev: 0, title: "x" })), "NOT_FOUND");
  });
  it("video layers are allowed for everyone", async () => {
    const p = await createProject(t.db, bob, {});
    const video = { ...image(), type: "video" as const };
    assert.equal(await apiCode(patchProject(t.db, bob, p.id, { rev: 0, doc: doc([video]) })), null);
  });
  it("a photo reference must be the caller's own, ready photo", async () => {
    const p = await createProject(t.db, bob, {});
    const mine = randomUUID();
    const theirs = randomUUID();
    const pending = randomUUID();
    await t.sql`insert into media (id,user_id,kind,status,storage_path,mime_type,bytes) values
      (${mine},${bob},'image','ready',${bob + "/" + mine + ".png"},'image/png',10),
      (${theirs},${alice},'image','ready',${alice + "/" + theirs + ".png"},'image/png',10),
      (${pending},${bob},'image','pending',${bob + "/" + pending + ".png"},'image/png',10)`;
    assert.equal(await apiCode(patchProject(t.db, bob, p.id, { rev: 0, doc: doc([image(theirs)]) })), "INVALID");
    assert.equal(await apiCode(patchProject(t.db, bob, p.id, { rev: 0, doc: doc([image(pending)]) })), "INVALID");
    assert.equal(await apiCode(patchProject(t.db, bob, p.id, { rev: 0, doc: doc([image("not-a-uuid")]) })), "INVALID");
    assert.equal(await apiCode(patchProject(t.db, bob, p.id, { rev: 0, doc: doc([image(mine), image(mine)]) })), null);
    const [row] = await t.sql<{ media_ids: string[] }[]>`select media_ids from projects where id = ${p.id}`;
    assert.deepEqual(row.media_ids, [mine], "media_ids is kept in step with the document, without duplicates");
  });
  it("saving a slide count past the ceiling is refused and changes nothing", async () => {
    const p = await createProject(t.db, bob, { slideCount: 10 });
    await assert.rejects(patchProject(t.db, bob, p.id, { rev: 0, slideCount: 501 }));
    assert.equal((await getProject(t.db, bob, p.id)).slideCount, 10);
  });
});

describe("list", () => {
  it("pages through everything exactly once, newest first, even when timestamps tie", async () => {
    const carol = await mkUser(t.sql, "carol@example.test");
    // one statement means one now(), so all 7 rows share a timestamp and only the id breaks the tie
    await t.sql`insert into projects (user_id, title, format, doc)
                select ${carol}, 'p' || n, 'square', ${t.sql.json(doc())} from generate_series(1, 7) n`;
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listProjects(t.db, carol, { limit: 3, cursor });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.next ?? undefined;
      pages++;
    } while (cursor);
    assert.equal(pages, 3);
    assert.equal(seen.length, 7);
    assert.equal(new Set(seen).size, 7, "no row repeated or skipped");
  });
  it("hides other users' projects and trashed ones", async () => {
    const dave = await mkUser(t.sql, "dave@example.test");
    const a = await createProject(t.db, dave, { title: "keep" });
    const b = await createProject(t.db, dave, { title: "trash" });
    await trashProject(t.db, dave, b.id);
    const page = await listProjects(t.db, dave, { limit: 10 });
    assert.deepEqual(page.items.map((i) => i.id), [a.id]);
  });
  it("rejects a tampered cursor", async () => {
    assert.equal(await apiCode(listProjects(t.db, alice, { limit: 5, cursor: Buffer.from("x|y").toString("base64url") })), "INVALID");
  });
});

describe("duplicate, trash, restore", () => {
  it("duplicates with a new id, revision 0, and a copied document", async () => {
    const p = await createProject(t.db, bob, { title: "Original" });
    await patchProject(t.db, bob, p.id, { rev: 0, doc: doc([image()]) });
    const c = await duplicateProject(t.db, bob, p.id);
    assert.notEqual(c.id, p.id);
    assert.equal(c.title, "Original copy");
    assert.equal(c.rev, 0);
    assert.equal(c.doc.elements.length, 1);
  });
  it("can't duplicate someone else's project", async () => {
    const p = await createProject(t.db, alice, {});
    assert.equal(await apiCode(duplicateProject(t.db, bob, p.id)), "NOT_FOUND");
  });
  it("trash then restore brings it back", async () => {
    const p = await createProject(t.db, bob, {});
    await trashProject(t.db, bob, p.id);
    assert.equal(await apiCode(getProject(t.db, bob, p.id)), "NOT_FOUND");
    await restoreProject(t.db, bob, p.id);
    assert.equal((await getProject(t.db, bob, p.id)).id, p.id);
  });
  it("trashing twice, or someone else's, is NOT_FOUND", async () => {
    const p = await createProject(t.db, bob, {});
    await trashProject(t.db, bob, p.id);
    assert.equal(await apiCode(trashProject(t.db, bob, p.id)), "NOT_FOUND");
    const q = await createProject(t.db, alice, {});
    assert.equal(await apiCode(trashProject(t.db, bob, q.id)), "NOT_FOUND");
  });
  it("a project older than 30 days in the trash can't be restored", async () => {
    const p = await createProject(t.db, bob, {});
    await trashProject(t.db, bob, p.id);
    await t.sql`update projects set deleted_at = now() - interval '31 days' where id = ${p.id}`;
    assert.equal(await apiCode(restoreProject(t.db, bob, p.id)), "NOT_FOUND");
  });
  it("can't restore someone else's trashed project", async () => {
    const p = await createProject(t.db, alice, {});
    await trashProject(t.db, alice, p.id);
    assert.equal(await apiCode(restoreProject(t.db, bob, p.id)), "NOT_FOUND");
  });
});
