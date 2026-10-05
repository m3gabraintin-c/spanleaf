import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { completeUpload, createUploadUrl, deleteMedia, getMediaUrls, MEDIA_BUCKET } from "@/server/media";
import { createProject, patchProject, trashProject } from "@/server/projects";
import { uploadUrlInput } from "@/server/schemas";
import { apiCode, FakeStorage, freshDb, makePremium, mkUser, type TestDb } from "./helpers";

let t: TestDb;
let alice: string;
let bob: string;
let storage: FakeStorage;
const input = { kind: "image" as const, mime: "image/png", bytes: 5000, width: 1200, height: 800 };
const deps = () => ({ db: t.db, storage });

/** What the browser does: upload the file and its thumbnail to the signed URLs. */
async function upload(user: string, over: Partial<typeof input> = {}, stored?: { size?: number; mime?: string; thumb?: boolean }) {
  const r = await createUploadUrl(deps(), user, { ...input, ...over });
  storage.put(MEDIA_BUCKET, r.upload.path, stored?.size ?? input.bytes, stored?.mime ?? input.mime);
  if (stored?.thumb !== false) storage.put(MEDIA_BUCKET, r.thumbUpload.path, 800, input.mime);
  return r;
}

before(async () => {
  t = await freshDb("media");
  alice = await mkUser(t.sql, "alice@example.test");
  bob = await mkUser(t.sql, "bob@example.test");
});
after(() => t.close());
const fresh = () => {
  storage = new FakeStorage();
};
fresh();

describe("request validation (the zod schema the route uses)", () => {
  it("accepts a normal image request", () => assert.ok(uploadUrlInput.safeParse(input).success));
  it("refuses other file types, oversize files, and absurd dimensions", () => {
    assert.ok(!uploadUrlInput.safeParse({ ...input, mime: "image/svg+xml" }).success);
    assert.ok(!uploadUrlInput.safeParse({ ...input, mime: "application/pdf" }).success);
    assert.ok(!uploadUrlInput.safeParse({ ...input, bytes: 26 * 1024 * 1024 }).success);
    assert.ok(!uploadUrlInput.safeParse({ ...input, bytes: 0 }).success);
    assert.ok(!uploadUrlInput.safeParse({ ...input, width: 100000 }).success);
    assert.ok(!uploadUrlInput.safeParse({ ...input, kind: "video" }).success);
  });
});

describe("upload-url", () => {
  it("makes a pending row whose paths sit in the caller's own folder", async () => {
    fresh();
    const r = await createUploadUrl(deps(), alice, input);
    const [row] = await t.sql`select * from media where id = ${r.mediaId}`;
    assert.equal(row.status, "pending");
    assert.equal(row.user_id, alice);
    assert.equal(row.storage_path, `${alice}/${r.mediaId}.png`);
    assert.equal(row.thumb_path, `${alice}/${r.mediaId}.thumb.png`);
    assert.ok(r.upload.url.startsWith("https://storage.test/upload/media/"));
  });
  it("refuses unsupported and oversize files even if the route's schema is bypassed", async () => {
    fresh();
    assert.equal(await apiCode(createUploadUrl(deps(), alice, { ...input, mime: "image/gif" })), "UNSUPPORTED_FILE");
    assert.equal(await apiCode(createUploadUrl(deps(), alice, { ...input, bytes: 30 * 1024 * 1024 })), "FILE_TOO_LARGE");
  });
  it("enforces the storage quota: 2 GB free, 20 GB premium", async () => {
    fresh();
    const carol = await mkUser(t.sql, "carol@example.test");
    const big = randomUUID();
    await t.sql`insert into media (id,user_id,kind,status,storage_path,mime_type,bytes) values (${big},${carol},'image','ready',${carol + "/" + big + ".png"},'image/png',${2 * 1024 ** 3 - 1000})`;
    assert.equal(await apiCode(createUploadUrl(deps(), carol, input)), "LIMIT_REACHED");
    await makePremium(t.sql, carol);
    assert.equal(await apiCode(createUploadUrl(deps(), carol, input)), null);
  });
  it("removes the pending row if storage can't make a URL", async () => {
    fresh();
    storage.failSign = true;
    const before = (await t.sql`select count(*)::int as n from media where user_id = ${alice}`)[0].n;
    assert.equal(await apiCode(createUploadUrl(deps(), alice, input)), "unknown");
    const after = (await t.sql`select count(*)::int as n from media where user_id = ${alice}`)[0].n;
    assert.equal(after, before);
  });
});

describe("complete", () => {
  it("marks the photo ready using the real stored size", async () => {
    fresh();
    const r = await upload(alice, {}, { size: 4321 });
    const m = await completeUpload(deps(), alice, r.mediaId);
    assert.equal(m.bytes, 4321);
    const [row] = await t.sql`select status, bytes::int as bytes from media where id = ${r.mediaId}`;
    assert.deepEqual({ ...row }, { status: "ready", bytes: 4321 });
  });
  it("is safe to call twice", async () => {
    fresh();
    const r = await upload(alice);
    await completeUpload(deps(), alice, r.mediaId);
    assert.equal((await completeUpload(deps(), alice, r.mediaId)).id, r.mediaId);
  });
  it("UPLOAD_MISSING when nothing arrived, and the row stays pending", async () => {
    fresh();
    const r = await createUploadUrl(deps(), alice, input);
    assert.equal(await apiCode(completeUpload(deps(), alice, r.mediaId)), "UPLOAD_MISSING");
    assert.equal((await t.sql`select status from media where id = ${r.mediaId}`)[0].status, "pending");
  });
  it("a file that is bigger than allowed is deleted and refused", async () => {
    fresh();
    const r = await upload(alice, {}, { size: 40 * 1024 * 1024 });
    assert.equal(await apiCode(completeUpload(deps(), alice, r.mediaId)), "FILE_TOO_LARGE");
    assert.equal((await t.sql`select count(*)::int as n from media where id = ${r.mediaId}`)[0].n, 0);
    assert.equal(storage.files.size, 0, "the stored objects were removed too");
  });
  it("a file that lied about its type is deleted and refused", async () => {
    fresh();
    const r = await upload(alice, {}, { mime: "text/html" });
    assert.equal(await apiCode(completeUpload(deps(), alice, r.mediaId)), "UNSUPPORTED_FILE");
    assert.equal((await t.sql`select count(*)::int as n from media where id = ${r.mediaId}`)[0].n, 0);
    assert.equal(storage.files.size, 0);
  });
  it("works without a thumbnail, and says so", async () => {
    fresh();
    const r = await upload(alice, {}, { thumb: false });
    await completeUpload(deps(), alice, r.mediaId);
    assert.equal((await t.sql`select thumb_path from media where id = ${r.mediaId}`)[0].thumb_path, null);
  });
  it("another user can't complete it", async () => {
    fresh();
    const r = await upload(alice);
    assert.equal(await apiCode(completeUpload(deps(), bob, r.mediaId)), "NOT_FOUND");
    assert.equal(await apiCode(completeUpload(deps(), bob, "nope")), "NOT_FOUND");
  });
});

describe("signed URLs", () => {
  it("only for the caller's own ready photos", async () => {
    fresh();
    const mine = await upload(alice);
    await completeUpload(deps(), alice, mine.mediaId);
    const pending = await upload(alice);
    const theirs = await upload(bob);
    await completeUpload(deps(), bob, theirs.mediaId);
    const urls = await getMediaUrls(deps(), alice, [mine.mediaId, pending.mediaId, theirs.mediaId, randomUUID()]);
    assert.deepEqual(Object.keys(urls), [mine.mediaId]);
    assert.ok(urls[mine.mediaId].url.includes(`${alice}/${mine.mediaId}.png`));
    assert.ok(urls[mine.mediaId].thumbUrl.includes(".thumb."));
  });
  it("the signed path can never be another user's folder", async () => {
    fresh();
    const theirs = await upload(bob);
    await completeUpload(deps(), bob, theirs.mediaId);
    const urls = await getMediaUrls(deps(), alice, [theirs.mediaId]);
    assert.deepEqual(urls, {});
  });
});

describe("delete", () => {
  it("removes the row and both files", async () => {
    fresh();
    const r = await upload(alice);
    await completeUpload(deps(), alice, r.mediaId);
    await deleteMedia(deps(), alice, r.mediaId);
    assert.equal((await t.sql`select count(*)::int as n from media where id = ${r.mediaId}`)[0].n, 0);
    assert.equal(storage.files.size, 0);
  });
  it("is IN_USE while a project uses it, even a project in the trash", async () => {
    fresh();
    const r = await upload(alice);
    await completeUpload(deps(), alice, r.mediaId);
    const p = await createProject(t.db, alice, {});
    const el = { id: randomUUID(), type: "image" as const, x: 0, y: 0, w: 10, h: 10, rotation: 0, locked: false, mediaId: r.mediaId };
    await patchProject(t.db, alice, p.id, { rev: 0, doc: { v: 1, background: { type: "color", value: "#fff" }, elements: [el] } });
    assert.equal(await apiCode(deleteMedia(deps(), alice, r.mediaId)), "IN_USE");
    await trashProject(t.db, alice, p.id);
    assert.equal(await apiCode(deleteMedia(deps(), alice, r.mediaId)), "IN_USE", "restoring the project would otherwise show a broken image");
    assert.equal(storage.files.size, 2, "nothing was deleted");
  });
  it("can't delete another user's photo", async () => {
    fresh();
    const r = await upload(bob);
    await completeUpload(deps(), bob, r.mediaId);
    assert.equal(await apiCode(deleteMedia(deps(), alice, r.mediaId)), "NOT_FOUND");
    assert.equal(storage.files.size, 2);
  });
});
