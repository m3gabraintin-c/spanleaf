import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DocSchema } from "@/lib/doc";
import { parseSticker, stickerAsset, stickerDataUrl, STICKER_IDS, STICKERS } from "@/lib/stickers";

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
