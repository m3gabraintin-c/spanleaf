import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newStickerElement } from "@/lib/defaults";
import { DocSchema } from "@/lib/doc";
import { DOODLE_IDS, parseSticker, stickerAsset, stickerDataUrl, STICKERS, TAPE_IDS } from "@/lib/stickers";

const STICKER_IDS = Object.keys(STICKERS);

const decode = (url: string) => decodeURIComponent(url.replace("data:image/svg+xml;charset=utf-8,", ""));

describe("built-in stickers", () => {
  it("every one is a plain, well-shaped SVG that uses the colour it is given", () => {
    for (const id of STICKER_IDS) {
      const svg = STICKERS[id].svg("#123abc");
      assert.ok(svg.startsWith("<svg ") && svg.endsWith("</svg>"), id);
      assert.match(svg, /viewBox="0 0 [\d.]+ [\d.]+"/, id);
      assert.ok(svg.includes("#123abc") || id === "label" || id.startsWith("tape"), id);
      const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
      assert.ok(Math.abs(Number(w) / Number(h) - STICKERS[id].aspect) < 0.01, `${id} aspect`);
    }
  });

  it("every sticker is tape, a label or a doodle, and the id lists agree with that", () => {
    assert.deepEqual([...TAPE_IDS].sort(), STICKER_IDS.filter((id) => STICKERS[id].kind === "tape").sort());
    assert.deepEqual([...DOODLE_IDS].sort(), STICKER_IDS.filter((id) => STICKERS[id].kind === "doodle").sort());
    assert.deepEqual(STICKER_IDS.filter((id) => STICKERS[id].kind === "label"), ["label"]);
    assert.equal(TAPE_IDS.length + DOODLE_IDS.length + 1, STICKER_IDS.length);
  });

  it("none can run script or reach out to another address", () => {
    for (const id of STICKER_IDS) {
      const svg = STICKERS[id].svg("#ffffff");
      assert.ok(!/<script|<foreignObject|<image|<use|href=|xlink|on\w+=|https?:/i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")), id);
    }
  });

  it("an asset path names a built-in only if it is on the list", () => {
    assert.equal(parseSticker(stickerAsset("star")), "star");
    for (const bad of [undefined, "", "star", "builtin:", "builtin:nope", "https://evil.test/x.svg", "builtin:../star", "builtin:__proto__", "builtin:constructor", "BUILTIN:star"]) {
      assert.equal(parseSticker(bad), null, String(bad));
    }
  });

  it("makes a data address that holds the drawing, and refuses a colour that isn't a hex", () => {
    const url = stickerDataUrl("heart", "#ff0000");
    assert.ok(url.startsWith("data:image/svg+xml;charset=utf-8,"));
    assert.ok(decode(url).includes("#ff0000"));
    const hostile = stickerDataUrl("heart", '"/><script>alert(1)</script>');
    assert.ok(!decode(hostile).includes("script"));
    assert.ok(decode(hostile).includes(STICKERS.heart.defaultTint));
  });

  it("a sticker element with a tint is a valid document element, and a bad tint is not", () => {
    const el = { id: "s", type: "sticker", x: 0, y: 0, w: 100, h: 100, rotation: 0, locked: false, assetPath: stickerAsset("star"), tint: "#f6d94a" };
    const doc = (e: object) => ({ v: 1 as const, background: { type: "color" as const, value: "#ffffff" }, elements: [e] as never });
    assert.ok(DocSchema.safeParse(doc(el)).success);
    assert.ok(!DocSchema.safeParse(doc({ ...el, tint: "yellow" })).success);
    assert.ok(!DocSchema.safeParse(doc({ ...el, assetPath: "x".repeat(201) })).success);
  });
});

describe("adding a sticker by hand", () => {
  it("every built-in makes a valid element, centred on the point, in its own shape and colour", () => {
    for (const id of STICKER_IDS) {
      const el = newStickerElement(id, 540, 675, 1080);
      assert.ok(DocSchema.safeParse({ v: 1, background: { type: "color", value: "#ffffff" }, elements: [el] }).success, id);
      assert.equal(el.type, "sticker");
      assert.equal(parseSticker(el.assetPath), id);
      assert.equal(el.tint, STICKERS[id].defaultTint);
      assert.equal(el.name, STICKERS[id].label);
      assert.ok(Math.abs(el.x + el.w / 2 - 540) <= 1 && Math.abs(el.y + el.h / 2 - 675) <= 1, `${id} is centred`);
      assert.ok(Math.abs(el.w / el.h / STICKERS[id].aspect - 1) < 0.05, `${id} keeps its shape`);
      assert.ok(el.w >= 150 && el.w <= 600, `${id} starts a sensible size`);
    }
  });
  it("tape starts narrower than a label, and each one gets its own id", () => {
    assert.ok(newStickerElement("tape", 0, 0, 1080).w < newStickerElement("label", 0, 0, 1080).w);
    assert.notEqual(newStickerElement("star", 0, 0, 1080).id, newStickerElement("star", 0, 0, 1080).id);
  });
});
