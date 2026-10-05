import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { DocSchema, layerName } from "@/lib/doc";
import { createProject, getProject, patchProject } from "@/server/projects";
import { patchProjectInput } from "@/server/schemas";
import { apiCode, freshDb, mkUser, type TestDb } from "./helpers";

let t: TestDb;
let alice: string;
const text = (over: Record<string, unknown> = {}) => ({ value: "Hello", font: "inter", size: 96, color: "#111111", align: "center", bold: true, ...over });
const el = (over: Record<string, unknown> = {}) => ({ id: randomUUID(), type: "text", x: 10, y: 20, w: 600, h: 120, rotation: 0, locked: false, text: text(), ...over });
const doc = (elements: unknown[]) => ({ v: 1 as const, background: { type: "color" as const, value: "#ffffff" }, elements: elements as never });

before(async () => {
  t = await freshDb("textdoc");
  alice = await mkUser(t.sql, "alice@example.test");
});
after(() => t.close());

describe("text layers in the saved document", () => {
  it("a text layer survives a save and a reload, field for field", async () => {
    const p = await createProject(t.db, alice, {});
    const e = el({ text: text({ value: "Café 🎉\nline two", font: "anton", bold: false, align: "left", color: "#e63946", size: 140 }) });
    await patchProject(t.db, alice, p.id, { rev: 0, doc: doc([e]) });
    const back = (await getProject(t.db, alice, p.id)).doc.elements[0];
    assert.deepEqual(back.text, e.text);
    assert.equal(back.h, 120);
  });
  it("the schema refuses a bad colour, a tiny or huge size, an unknown alignment, and 2,001 characters", () => {
    for (const bad of [text({ color: "red" }), text({ color: "#12345" }), text({ size: 3 }), text({ size: 5000 }), text({ align: "justify" }), text({ value: "x".repeat(2001) }), text({ font: "" }), text({ bold: "yes" })]) {
      assert.ok(!DocSchema.safeParse(doc([el({ text: bad })])).success, JSON.stringify(bad));
    }
    assert.ok(DocSchema.safeParse(doc([el({ text: text({ value: "x".repeat(2000) }) })])).success);
  });
  it("the request schema used by the route accepts the same document and refuses a bad one", () => {
    assert.ok(patchProjectInput.safeParse({ rev: 0, doc: doc([el()]) }).success);
    assert.ok(!patchProjectInput.safeParse({ rev: 0, doc: doc([el({ text: text({ size: -1 }) })]) }).success);
  });
  it("unknown fields inside a text layer are dropped, not stored", async () => {
    const p = await createProject(t.db, alice, {});
    const e = el({ text: { ...text(), script: "<script>", url: "https://evil.test" }, onclick: "x" });
    const parsed = DocSchema.parse(doc([e]));
    assert.ok(!("script" in (parsed.elements[0].text as object)));
    assert.ok(!("onclick" in parsed.elements[0]));
    await patchProject(t.db, alice, p.id, { rev: 0, doc: parsed });
    assert.ok(!JSON.stringify((await getProject(t.db, alice, p.id)).doc).includes("evil.test"));
  });
  it("text doesn't need a photo reference, and a text-only project has no media ids", async () => {
    const p = await createProject(t.db, alice, {});
    await patchProject(t.db, alice, p.id, { rev: 0, doc: doc([el(), el()]) });
    const [row] = await t.sql`select media_ids from projects where id = ${p.id}`;
    assert.deepEqual(row.media_ids, []);
  });
  it("a text layer with a missing text block is still a valid element (older documents)", async () => {
    const p = await createProject(t.db, alice, {});
    assert.equal(await apiCode(patchProject(t.db, alice, p.id, { rev: 0, doc: doc([el({ text: undefined })]) })), null);
  });
  it("layer names: text shows its words, photos their file name, and blanks say so", () => {
    assert.equal(layerName(el({ text: text({ value: "  Summer   trip\nis here  " }) }) as never), "Summer trip is here");
    assert.equal(layerName(el({ text: text({ value: "" }) }) as never), "Empty text");
    assert.equal(layerName(el({ text: text({ value: "x".repeat(100) }) }) as never).length, 40);
    assert.equal(layerName({ id: "a", type: "image", x: 0, y: 0, w: 1, h: 1, rotation: 0, locked: false, name: "beach.jpg" }), "beach.jpg");
    assert.equal(layerName({ id: "a", type: "image", x: 0, y: 0, w: 1, h: 1, rotation: 0, locked: false }), "Photo");
  });
  it("a 500 layer document with long text is under the 2 MB limit", () => {
    const big = doc(Array.from({ length: 500 }, () => el({ text: text({ value: "y".repeat(2000) }) })));
    assert.ok(JSON.stringify(big).length < 2 * 1024 * 1024 * 1.0 + 1, "if this fails the cap is too tight for the schema's own maximum");
  });
});
