import { Design, Layer, kindName, newDesign } from "./carouselModel";
import { makePdf } from "./pdfExport";
import { ringOffsets } from "./stickerEdge";
import { fitFontSize, hasMarkup, layoutRich, parseRuns, plainText } from "./richText";
import { HISTORY_KEEP, packHistory, unpackHistory } from "./editHistory";
import { TEMPLATES, buildTemplate } from "./templates";
import { polaroidBox } from "./photoStyle";

const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("makePdf", () => {
  const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, ...Array.from({ length: n }, (_, i) => i % 251), 0xff, 0xd9]);

  it("makes one page a picture, with the pictures' bytes inside unchanged", () => {
    const a = jpeg(300);
    const b = jpeg(500);
    const pdf = makePdf([
      { jpeg: a, width: 1080, height: 1350 },
      { jpeg: b, width: 1080, height: 1350 },
    ]);
    const s = text(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s.match(/\/Type \/Page /g)?.length).toBe(2);
    expect(s).toContain("/Count 2");
    expect(s).toContain("/MediaBox [0 0 1080 1350]");
    expect(s).toContain(`/Length ${a.length}`);
    expect(s).toContain(text(b));
  });

  it("has a cross-reference table that points at every object", () => {
    const pdf = makePdf([{ jpeg: jpeg(100), width: 800, height: 1000 }]);
    const s = text(pdf);
    const start = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe("xref");
    const rows = s.slice(start).split("\n").slice(3, 8);
    rows.forEach((row, i) => {
      const at = Number(row.slice(0, 10));
      expect(s.slice(at, at + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("refuses no pages", () => {
    expect(() => makePdf([])).toThrow();
  });
});

describe("sticker edge", () => {
  it("spreads points evenly round a circle of the edge's width", () => {
    for (const r of [2, 10, 40]) {
      const pts = ringOffsets(r);
      expect(pts.length).toBeGreaterThanOrEqual(12);
      for (const [x, y] of pts) expect(Math.abs(Math.hypot(x, y) - r)).toBeLessThan(0.02);
    }
  });
});

describe("highlighted words", () => {
  const measure = (t: string, accent: boolean) => t.length * (accent ? 12 : 10);

  it("finds words between stars and leaves single stars alone", () => {
    expect(parseRuns("A *big* day")).toEqual([
      { text: "A ", accent: false },
      { text: "big", accent: true },
      { text: " day", accent: false },
    ]);
    expect(hasMarkup("5 * 3 = 15")).toBe(false);
    expect(hasMarkup("so *good*")).toBe(true);
    expect(plainText("so *good* and *new*")).toBe("so good and new");
  });

  it("wraps at spaces within the width, keeps line breaks, and measures highlighted words bold", () => {
    const lines = layoutRich("one two *three* four\nfive", 120, measure);
    expect(lines.map((l) => l.pieces.filter((p) => p.text.trim()).map((p) => p.text))).toEqual([["one", "two"], ["three", "four"], ["five"]]);
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(120);
    const three = lines[1].pieces.find((p) => p.text === "three")!;
    expect(three.accent).toBe(true);
    expect(three.width).toBe(60);
  });

  it("gives a word wider than the box a line of its own", () => {
    const lines = layoutRich("a extraordinarily b", 50, measure);
    expect(lines.map((l) => l.pieces.filter((p) => p.text.trim()).map((p) => p.text))).toEqual([["a"], ["extraordinarily"], ["b"]]);
  });

  it("fits the widest line to the width, within 20 to 300", () => {
    expect(fitFontSize([500, 250], 1000)).toBe(196);
    expect(fitFontSize([10], 1000)).toBe(300);
    expect(fitFontSize([100000], 100)).toBe(20);
  });
});

describe("lasting undo", () => {
  const pic = "data:image/jpeg;base64," + "A".repeat(5000);
  const layer = (id: string, src?: string): Layer => ({ id, type: "image", name: id, src, x: 0, y: 0, w: 10, h: 10, rotation: 0, locked: false });
  const step = (n: number): Design => ({ ...newDesign("square", 1), background: `#00000${n % 10}`, layers: [layer("a", pic), layer("b", n % 2 ? pic : undefined)] });

  it("keeps each picture once and gives back the same steps", () => {
    const past = Array.from({ length: 5 }, (_, i) => step(i));
    const packed = packHistory(past);
    expect(packed.blobs.length).toBe(1);
    expect(JSON.stringify(packed).length).toBeLessThan(pic.length * 2);
    expect(unpackHistory(packed)).toEqual(past);
  });

  it("keeps only the latest steps", () => {
    const past = Array.from({ length: HISTORY_KEEP + 12 }, (_, i) => step(i));
    const back = unpackHistory(packHistory(past));
    expect(back.length).toBe(HISTORY_KEEP);
    expect(back[back.length - 1]).toEqual(past[past.length - 1]);
  });
});

describe("more templates", () => {
  it("builds every template, and labels the frames where a template asks for it", () => {
    for (const t of TEMPLATES) {
      const d = buildTemplate(t.id, "portrait_4_5", () => 60);
      expect(d).not.toBeNull();
      const frames = d!.layers.filter((l) => l.type === "image");
      expect(frames.length).toBe(t.frames.length);
      const texts = d!.layers.filter((l) => l.type === "text").map((l) => l.text);
      expect(texts).toContain(t.title);
      if (t.labels) frames.forEach((_, i) => expect(texts).toContain(t.labels!(i)));
    }
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(12);
  });
});

describe("names and cards", () => {
  it("names every kind of layer", () => {
    expect(kindName({ type: "shape", shape: "ellipse" })).toBe("Circle");
    expect(kindName({ type: "shape" })).toBe("Rectangle");
    expect(kindName({ type: "image" })).toBe("Empty frame");
    expect(kindName({ type: "image", src: "x" })).toBe("Photo");
    expect(kindName({ type: "video" })).toBe("Video");
  });

  it("lays out an instant-photo card with the photo inside and a deeper bottom", () => {
    const b = polaroidBox(600, 720);
    expect(b.photo.x).toBe(b.pad);
    expect(b.photo.x * 2 + b.photo.w).toBe(600);
    expect(b.bottom).toBeGreaterThan(b.pad * 2);
    expect(b.photo.y + b.photo.h + b.bottom).toBe(720);
  });
});