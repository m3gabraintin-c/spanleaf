import { instagramChecks } from "./instagram";
import { maskPath } from "./maskPath";
import { MASK_SHAPES } from "./carouselModel";

describe("instagramChecks", () => {
  it("counts characters, hashtags and mentions", () => {
    const c = instagramChecks({ caption: "Summer #trip #beach with @sam and @jo.k 🌊", slides: 5, storyShape: false });
    expect(c.hashtags).toBe(2);
    expect(c.mentions).toBe(2);
    expect(c.characters).toBe([..."Summer #trip #beach with @sam and @jo.k 🌊"].length);
    expect(c.warnings).toEqual([]);
  });

  it("warns about more than 20 slides, long captions, too many hashtags and story-shaped slides", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    const c = instagramChecks({ caption: tags + " " + "x".repeat(2300), slides: 21, storyShape: true });
    expect(c.warnings.length).toBe(4);
    expect(c.warnings.join(" ")).toContain("20 slides");
    expect(c.warnings.join(" ")).toContain("9:16");
  });

  it("doesn't count a # in the middle of a word as a hashtag", () => {
    expect(instagramChecks({ caption: "C#sharp and email@me.com", slides: 1, storyShape: false }).hashtags).toBe(0);
  });
});

describe("maskPath", () => {
  const recorder = () => {
    const calls: string[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    const point = (x: number, y: number) => {
      xs.push(x);
      ys.push(y);
    };
    return {
      calls,
      xs,
      ys,
      ctx: {
        beginPath: () => calls.push("begin"),
        closePath: () => calls.push("close"),
        moveTo: (x: number, y: number) => (calls.push("move"), point(x, y)),
        lineTo: (x: number, y: number) => (calls.push("line"), point(x, y)),
        bezierCurveTo: (_a: number, _b: number, _c: number, _d: number, x: number, y: number) => (calls.push("curve"), point(x, y)),
        ellipse: () => calls.push("ellipse"),
        arc: () => calls.push("arc"),
      },
    };
  };

  it("draws a closed path for every shape, inside the box", () => {
    for (const shape of MASK_SHAPES) {
      const r = recorder();
      maskPath(r.ctx, shape, 400, 300);
      expect(r.calls[0]).toBe("begin");
      expect(r.calls[r.calls.length - 1]).toBe("close");
      for (const x of r.xs) {
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(x).toBeLessThanOrEqual(400.01);
      }
      for (const y of r.ys) {
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeLessThanOrEqual(300.01);
      }
    }
  });

  it("tears the edges the same way every time", () => {
    const a = recorder();
    const b = recorder();
    maskPath(a.ctx, "torn", 400, 300);
    maskPath(b.ctx, "torn", 400, 300);
    expect(a.xs).toEqual(b.xs);
    expect(a.ys).toEqual(b.ys);
  });
});
