import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { FALLBACK_PLAN, type ModelOutput } from "@/lib/plan";
import { restyleDoc } from "@/lib/restyle";
import { customise, resolveTheme, THEMES } from "@/lib/themes";
import { getProject, patchProject } from "@/server/projects";
import type { ComposeAi } from "@/server/ai";
import { composeProject } from "@/server/compose";
import { completeUpload, createUploadUrl, MEDIA_BUCKET } from "@/server/media";
import { apiCode, FakeStorage, freshDb, mkUser, type TestDb } from "./helpers";

let t: TestDb;
let alice: string;
let bob: string;
let storage: FakeStorage;

const tag = { subject: "coffee", mood: "cosy", palette: ["#c8a27a"], focus: { x: 0.5, y: 0.5 } };
const MODEL_BACKGROUND = "#e8f0ea";

class FakeAi implements ComposeAi {
  calls: { url: string }[][] = [];
  fail = false;
  async analyze(images: { url: string }[]): Promise<ModelOutput> {
    this.calls.push(images);
    if (this.fail) throw new Error("model down");
    return {
      photos: images.map(() => tag),
      plan: { theme: "scrapbook", background: MODEL_BACKGROUND, pattern: "grid", ink: "#2b2b2b", font: "caveat", title: "hello", captions: [] },
    };
  }
}
let ai: FakeAi;
const deps = (withAi: ComposeAi | null = ai) => ({ db: t.db, storage, ai: withAi });

/** What the browser does for one photo: upload the file and its thumbnail, then confirm. */
async function ready(user: string, width = 4000, height = 3000) {
  const r = await createUploadUrl({ db: t.db, storage }, user, { kind: "image", mime: "image/png", bytes: 5000, width, height });
  storage.put(MEDIA_BUCKET, r.upload.path, 5000, "image/png");
  storage.put(MEDIA_BUCKET, r.thumbUpload.path, 800, "image/png");
  await completeUpload({ db: t.db, storage }, user, r.mediaId);
  return r.mediaId;
}
const many = async (user: string, n: number) => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(await ready(user));
  return out;
};
const projectCount = async (user: string) => (await t.sql`select count(*)::int as n from projects where user_id = ${user}`)[0].n as number;
const slideOf = (e: { x: number; w: number }) => Math.floor((e.x + e.w / 2) / 1080);

before(async () => {
  t = await freshDb("compose");
  alice = await mkUser(t.sql, "alice@example.test");
  bob = await mkUser(t.sql, "bob@example.test");
});
after(() => t.close());
const fresh = () => {
  storage = new FakeStorage();
  ai = new FakeAi();
};
fresh();

describe("composeProject", () => {
  it("makes a saved project that holds every photo, and records which photos it uses", async () => {
    fresh();
    const ids = await many(alice, 4);
    const p = await composeProject(deps(), alice, { mediaIds: ids, seed: 1 });
    assert.equal(p.slideCount, 2);
    assert.equal(p.title, "My carousel");
    assert.equal(p.format, "portrait_4_5");
    assert.deepEqual(p.doc.elements.filter((e) => e.type === "image").map((e) => e.mediaId).sort(), [...ids].sort());
    const [row] = await t.sql`select media_ids from projects where id = ${p.id}`;
    assert.deepEqual([...row.media_ids].sort(), [...ids].sort());
  });

  it("uses the model's colours and title", async () => {
    fresh();
    const p = await composeProject(deps(), alice, { mediaIds: await many(alice, 3), seed: 1 });
    assert.equal(p.doc.background.value, MODEL_BACKGROUND);
    assert.deepEqual(p.doc.elements.filter((e) => e.type === "text").map((e) => e.text!.value), ["hello"]);
  });

  it("shows the model only thumbnails of the caller's own photos", async () => {
    fresh();
    const ids = await many(alice, 3);
    await composeProject(deps(), alice, { mediaIds: ids, seed: 1 });
    assert.equal(ai.calls.length, 1);
    assert.equal(ai.calls[0].length, 3);
    for (const { url } of ai.calls[0]) assert.ok(url.includes(".thumb.") && url.includes(alice), url);
  });

  it("still makes a carousel, with plain defaults, when the model fails or isn't configured", async () => {
    fresh();
    ai.fail = true;
    const failed = await composeProject(deps(), alice, { mediaIds: await many(alice, 3), seed: 1 });
    assert.equal(failed.doc.background.value, FALLBACK_PLAN.background);
    assert.equal(failed.doc.elements.filter((e) => e.type === "image").length, 3);
    const none = await composeProject(deps(null), alice, { mediaIds: await many(alice, 3), seed: 1 });
    assert.equal(none.doc.background.value, FALLBACK_PLAN.background);
  });

  it("refuses another person's photo, and leaves no half-made project behind", async () => {
    fresh();
    const mine = await ready(alice);
    const theirs = await ready(bob);
    const before = await projectCount(alice);
    assert.equal(await apiCode(composeProject(deps(), alice, { mediaIds: [mine, theirs] })), "INVALID");
    assert.equal(await projectCount(alice), before);
    assert.equal(ai.calls.length, 0, "no photo of anyone's reached the model");
  });

  it("refuses a photo whose upload was never confirmed", async () => {
    fresh();
    const pending = await createUploadUrl({ db: t.db, storage }, alice, { kind: "image", mime: "image/png", bytes: 5000, width: 100, height: 100 });
    assert.equal(await apiCode(composeProject(deps(), alice, { mediaIds: [pending.mediaId] })), "INVALID");
  });

  it("refuses an empty list, a repeated photo, and an id that isn't one", async () => {
    fresh();
    const id = await ready(alice);
    assert.equal(await apiCode(composeProject(deps(), alice, { mediaIds: [] })), "INVALID");
    assert.equal(await apiCode(composeProject(deps(), alice, { mediaIds: [id, id] })), "INVALID");
    assert.equal(await apiCode(composeProject(deps(), alice, { mediaIds: ["nope"] })), "INVALID");
  });

  it("fits 30 photos into a free account's 10 slides", async () => {
    fresh();
    const p = await composeProject(deps(), alice, { mediaIds: await many(alice, 30), seed: 2 });
    assert.equal(p.slideCount, 10);
    assert.equal(p.doc.elements.filter((e) => e.type === "image").length, 30);
  });

  it("keeps the person's order: the first photos land on the first slide", async () => {
    fresh();
    const ids = await many(alice, 7);
    const p = await composeProject(deps(), alice, { mediaIds: ids, seed: 3 });
    const slideOfPhoto = (id: string) => slideOf(p.doc.elements.find((e) => e.mediaId === id)!);
    assert.deepEqual(ids.map(slideOfPhoto), [0, 0, 0, 1, 1, 2, 2]);
  });

  it("the same seed gives the same layout", async () => {
    fresh();
    const ids = await many(alice, 5);
    const strip = (p: Awaited<ReturnType<typeof composeProject>>) => p.doc.elements.map(({ id: _id, ...rest }) => rest);
    const a = await composeProject(deps(), alice, { mediaIds: ids, seed: 9 });
    const b = await composeProject(deps(), alice, { mediaIds: ids, seed: 9 });
    assert.deepEqual(strip(a), strip(b));
  });

  it("honours the format and title", async () => {
    fresh();
    const p = await composeProject(deps(), alice, { mediaIds: await many(alice, 3), format: "square", title: "Lisbon", seed: 1 });
    assert.equal(p.format, "square");
    assert.equal(p.title, "Lisbon");
    for (const e of p.doc.elements) assert.ok(e.x >= 0 && e.x + e.w <= 1080 * p.slideCount);
  });

  it("uses the theme the person chose, even when the model picked another", async () => {
    fresh();
    const p = await composeProject(deps(), alice, { mediaIds: await many(alice, 4), theme: "film", seed: 1 });
    assert.equal(p.doc.background.value, THEMES.film.palette.background, "film keeps its own dark background, not the model's");
    assert.ok(p.doc.elements.filter((e) => e.type === "image").every((e) => e.outline?.width === 4));
    assert.equal(p.doc.compose?.theme, "film");
    assert.equal(p.doc.elements.filter((e) => e.type === "sticker").length, 0);
  });

  it("without a chosen theme it saves the one the model picked", async () => {
    fresh();
    const p = await composeProject(deps(), alice, { mediaIds: await many(alice, 3), seed: 1 });
    assert.equal(p.doc.compose?.theme, "scrapbook");
  });

  it("saves a custom theme with the project and reads it back whole", async () => {
    fresh();
    const base = resolveTheme("clean");
    const custom = customise(base, { tilt: 5, edges: "oval", decorations: "lots" }, { background: base.palette.background, ink: base.palette.ink, pattern: base.palette.pattern, font: base.font });
    const p = await composeProject(deps(), alice, { mediaIds: await many(alice, 4), theme: custom, seed: 2 });
    assert.deepEqual(p.doc.compose?.theme, custom);
    const [row] = await t.sql`select doc from projects where id = ${p.id}`;
    assert.deepEqual(row.doc.compose.theme, custom);
  });

  it("saves what it needs to restyle: the plan, the model's notes on each photo, the order and the seed", async () => {
    fresh();
    const ids = await many(alice, 5);
    const p = await composeProject(deps(), alice, { mediaIds: ids, seed: 77 });
    assert.deepEqual(p.doc.compose?.order, ids);
    assert.deepEqual(Object.keys(p.doc.compose!.tags).sort(), [...ids].sort());
    assert.equal(p.doc.compose?.seed, 77);
    assert.equal(p.doc.compose?.plan.title, "hello");
  });

  it("a saved project can be restyled in another theme, saved, and loaded again", async () => {
    fresh();
    const ids = await many(alice, 7);
    const p = await composeProject(deps(), alice, { mediaIds: ids, seed: 3 });
    const next = restyleDoc(p.doc, { format: p.format, slideCount: p.slideCount, theme: "editorial", seed: 4 })!;
    const saved = await patchProject(t.db, alice, p.id, { rev: p.rev, doc: next });
    const back = await getProject(t.db, alice, p.id);
    assert.equal(back.rev, saved.rev);
    assert.equal(back.slideCount, p.slideCount);
    assert.equal(back.doc.compose?.theme, "editorial");
    assert.deepEqual(back.doc.elements.filter((e) => e.type === "image").map((e) => e.mediaId).sort(), [...ids].sort());
    const [row] = await t.sql`select media_ids from projects where id = ${p.id}`;
    assert.deepEqual([...row.media_ids].sort(), [...ids].sort());
    assert.equal(back.doc.elements.filter((e) => e.type === "sticker").length, 0, "editorial has no stickers");
  });
});
