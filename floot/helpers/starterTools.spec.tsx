import { Layer, SLIDE_WIDTH, FORMATS, FORMAT_KEYS, rotatedBy } from "./carouselModel";
import { TEMPLATES, buildTemplate } from "./templates";
import { THEMES } from "./themes";

const centre = (l: Pick<Layer, "x" | "y" | "w" | "h" | "rotation">) => {
  const a = (l.rotation * Math.PI) / 180;
  return { x: l.x + (l.w / 2) * Math.cos(a) - (l.h / 2) * Math.sin(a), y: l.y + (l.w / 2) * Math.sin(a) + (l.h / 2) * Math.cos(a) };
};

describe("rotatedBy", () => {
  const cases = [
    { x: 100, y: 200, w: 300, h: 150, rotation: 0 },
    { x: 1500, y: 80, w: 220, h: 400, rotation: 33 },
    { x: -40, y: 600, w: 90, h: 90, rotation: -120 },
    { x: 800, y: 800, w: 500, h: 60, rotation: 179 },
  ];

  it("keeps the middle of the layer where it was", () => {
    for (const c of cases) {
      for (const deg of [90, -90, 45, 180]) {
        const r = rotatedBy(c, deg);
        const before = centre(c);
        const after = centre({ ...c, ...r });
        expect(Math.abs(before.x - after.x)).toBeLessThan(0.05);
        expect(Math.abs(before.y - after.y)).toBeLessThan(0.05);
      }
    }
  });

  it("turns by the amount asked and stays between -180 and 180", () => {
    expect(rotatedBy(cases[0], 90).rotation).toBe(90);
    expect(rotatedBy(cases[0], -90).rotation).toBe(-90);
    expect(rotatedBy({ ...cases[0], rotation: 170 }, 20).rotation).toBe(-170);
    expect(rotatedBy({ ...cases[0], rotation: 90 }, 90).rotation).toBe(180);
    for (const c of cases) {
      const r = rotatedBy(c, 90).rotation;
      expect(r).toBeGreaterThan(-180.001);
      expect(r).toBeLessThanOrEqual(180);
    }
  });

  it("four quarter turns bring a layer back to where it started", () => {
    for (const c of cases) {
      let l = { ...c };
      for (let i = 0; i < 4; i++) l = { ...l, ...rotatedBy(l, 90) };
      expect(Math.abs(l.x - c.x)).toBeLessThan(0.1);
      expect(Math.abs(l.y - c.y)).toBeLessThan(0.1);
      expect(Math.abs(((l.rotation - c.rotation + 540) % 360) - 180)).toBeLessThan(0.01);
    }
  });

  it("a left turn undoes a right turn", () => {
    const c = cases[1];
    const there = { ...c, ...rotatedBy(c, 90) };
    const back = { ...there, ...rotatedBy(there, -90) };
    expect(Math.abs(back.x - c.x)).toBeLessThan(0.05);
    expect(Math.abs(back.y - c.y)).toBeLessThan(0.05);
  });
});

describe("templates", () => {
  // Text can't be measured without a real canvas, so a fixed height stands in.
  const build = (id: string, format: (typeof FORMAT_KEYS)[number]) => buildTemplate(id, format, () => 100);

  it("every template has a theme that exists", () => {
    for (const t of TEMPLATES) expect(THEMES.some((x) => x.id === t.theme)).toBe(true);
  });

  it("builds empty frames in the theme, with a title, in every slide shape", () => {
    for (const t of TEMPLATES) {
      for (const format of FORMAT_KEYS) {
        const d = build(t.id, format)!;
        const theme = THEMES.find((x) => x.id === t.theme)!;
        expect(d.format).toBe(format);
        expect(d.background).toBe(theme.background);
        const frames = d.layers.filter((l) => l.type === "image");
        expect(frames.length).toBe(t.frames.length);
        expect(frames.every((f) => !f.src)).toBe(true);
        // A title, plus a label for each frame in templates that number or name their frames.
        expect(d.layers.filter((l) => l.type === "text").length).toBe(1 + (t.labels ? frames.length : 0));
        expect(d.slideCount).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps every frame inside the canvas, with the shape of a photo that fits it", () => {
    for (const t of TEMPLATES) {
      const d = build(t.id, "portrait_4_5")!;
      for (const f of d.layers.filter((l) => l.type === "image")) {
        expect(f.x).toBeGreaterThanOrEqual(-1);
        expect(f.x + f.w).toBeLessThanOrEqual(d.slideCount * SLIDE_WIDTH + 1);
        expect(f.y).toBeGreaterThanOrEqual(-1);
        expect(f.y + f.h).toBeLessThanOrEqual(FORMATS.portrait_4_5.height + 1);
        const aspect = f.natural!.w / f.natural!.h;
        expect(Math.abs(f.w / f.h - aspect)).toBeLessThan(0.02);
      }
    }
  });

  it("gives every frame its own id, and a project from the same template gets new ones", () => {
    const a = build("trip", "square")!;
    const b = build("trip", "square")!;
    expect(new Set(a.layers.map((l) => l.id)).size).toBe(a.layers.length);
    expect(a.layers.some((l) => b.layers.some((m) => m.id === l.id))).toBe(false);
  });

  it("an unknown template is nothing", () => {
    expect(build("nope", "square")).toBeNull();
  });
});
