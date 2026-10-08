import { pageLabel } from "./carouselModel";
import { parseSlideList } from "../components/EditorDialogs";

describe("parseSlideList", () => {
  it("reads single numbers and ranges, counting from 1, into indexes from 0, sorted without repeats", () => {
    expect(parseSlideList("1-3, 5", 10)).toEqual([0, 1, 2, 4]);
    expect(parseSlideList("5, 2, 2, 3-2", 10)).toEqual([1, 2, 4]);
    expect(parseSlideList(" 7 ", 10)).toEqual([6]);
  });

  it("drops numbers outside the project and anything that isn't a number or range", () => {
    expect(parseSlideList("0, 11, 4", 10)).toEqual([3]);
    expect(parseSlideList("8-20", 10)).toEqual([7, 8, 9]);
    expect(parseSlideList("abc, 1.5, -2, 3-", 10)).toEqual([]);
    expect(parseSlideList("", 10)).toEqual([]);
  });
});

describe("pageLabel", () => {
  it("reads as a fraction or a number counting from 1", () => {
    expect(pageLabel("fraction", 0, 5)).toBe("1/5");
    expect(pageLabel("fraction", 4, 5)).toBe("5/5");
    expect(pageLabel("number", 2, 5)).toBe("3");
  });

  it("dots mark the current slide, with at most 12 dots", () => {
    expect(pageLabel("dots", 1, 3)).toBe("○ ● ○");
    expect(pageLabel("dots", 0, 40).split(" ").length).toBe(12);
    expect(pageLabel("dots", 30, 40).split(" ").pop()).toBe("●");
  });
});
