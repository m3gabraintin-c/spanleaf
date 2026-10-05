import { test, expect, signIn, newProject, addPhotos, images, geo, toScreen, waitSaved, readProject, axeClean, openTool, elementsOf, ASSET } from "./fixtures";

test.describe("phone (Chromium emulating a Pixel 7: touch, 390px, device pixel ratio 3)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("P-H1 make a carousel with touch: add, drag a photo with a finger, export", async ({ page, context }) => {
    const id = await newProject(page, { name: "On my phone" });
    await addPhotos(page, ASSET("gradient.png"));
    const cdp = await context.newCDPSession(page);
    const finger = (type: string, x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] } as never);
    const g = await geo(page);
    const [img] = await images(page);
    const [sx, sy] = toScreen(g, img.x + 60, img.y + 60);
    await finger("touchStart", sx, sy);
    for (let i = 1; i <= 10; i++) await finger("touchMove", sx + i * 6, sy + i * 4);
    await finger("touchEnd");
    await waitSaved(page);
    const moved = (await readProject(page, id)).doc.elements[0];
    expect(moved.x - img.x).toBeGreaterThan(20);
    expect(Math.abs(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth))).toBeLessThanOrEqual(0);
  });

  test("P-E1 the resize handles are big enough to hit with a finger (44 CSS px)", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const size = await page.evaluate(() => {
      const stage = (window as any).Konva.stages[0];
      const a = stage.findOne(".bottom-right");
      return { visual: a.width(), hit: a.width() + a.hitStrokeWidth() };
    });
    expect(size.hit, `a ${size.hit}px target is too small for a thumb`).toBeGreaterThanOrEqual(44);
  });

  test("P-E2 portrait to landscape and back keeps the canvas and selection", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(400);
    expect((await images(page))).toHaveLength(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("P-E3 the tool rail scrolls sideways so every tool can be reached", async ({ page }) => {
    await newProject(page);
    const rail = page.getByRole("navigation", { name: "Editor tools" });
    await rail.getByRole("button", { name: "Adjust" }).scrollIntoViewIfNeeded();
    await rail.getByRole("button", { name: "Adjust" }).click();
    await expect(page.getByRole("region", { name: "Adjust" })).toBeVisible();
  });

  test("P-A1 accessibility on the phone layout", async ({ page }) => {
    await newProject(page);
    await axeClean(page, "phone editor");
  });

  test("P-N1 with the Text panel open the canvas stays big enough to work with, and nothing spills sideways", async ({ page }) => {
    await newProject(page);
    await openTool(page, "Text");
    await page.getByRole("button", { name: "Add text" }).click();
    await expect(page.locator("#text-value")).toBeVisible();
    const canvas = (await page.getByRole("region", { name: "Canvas area" }).boundingBox())!;
    expect(canvas.height, "the panel has squeezed the canvas to nothing").toBeGreaterThan(220);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over).toBeLessThanOrEqual(0);
    // the panel scrolls on its own, so the colour picker at the bottom is reachable
    await page.getByRole("radio", { name: "#e63946" }).scrollIntoViewIfNeeded();
    await page.getByRole("radio", { name: "#e63946" }).click();
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  });

  test("P-N2 the floating menu stays on screen, even for a photo at the edge", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const menu = page.getByRole("toolbar", { name: "Selected element" });
    await expect(menu).toBeVisible();
    const b = (await menu.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    expect(b.y).toBeGreaterThanOrEqual(0);
    for (const name of ["Duplicate", "Lock", "Delete"]) {
      const t = (await menu.getByRole("button", { name }).boundingBox())!;
      expect(Math.min(t.width, t.height), `${name} is too small to tap`).toBeGreaterThanOrEqual(40);
    }
  });

  test("P-N3 the header with undo, redo, status and Export fits a 390px screen with tappable buttons", async ({ page }) => {
    await newProject(page, { name: "A fairly long project name here" });
    const header = (await page.locator("header").boundingBox())!;
    expect(header.width).toBeLessThanOrEqual(390);
    for (const name of ["Undo", "Redo", "Export"]) {
      const b = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(b.x + b.width, `${name} runs off the right edge`).toBeLessThanOrEqual(390);
      expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(36);
    }
  });

  test("P-N4 a finger can reorder layers by holding the handle and dragging", async ({ page, context }) => {
    const id = await newProject(page);
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    await openTool(page, "Layers");
    const rows = page.getByRole("list", { name: /Layers/ }).getByRole("listitem");
    const grip = (await rows.nth(1).getByRole("button", { name: /Reorder/ }).boundingBox())!;
    const target = (await rows.nth(0).boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] } as never);
    const gx = grip.x + grip.width / 2;
    const gy = grip.y + grip.height / 2;
    await touch("touchStart", gx, gy);
    await page.waitForTimeout(260); // the drag library waits a moment so a scroll isn't mistaken for a drag
    for (let i = 1; i <= 8; i++) await touch("touchMove", gx, gy - ((gy - (target.y + 6)) * i) / 8);
    await touch("touchEnd");
    await expect(rows.nth(0)).toContainText("gradient.png");
    await waitSaved(page);
    expect((await elementsOf(page, id)).map((e: { name: string }) => e.name)).toEqual(["transparent.png", "gradient.png"]);
  });

  test("P-N5 accessibility with the Text, Layers and Colour panels open on a phone", async ({ page }) => {
    await newProject(page);
    await openTool(page, "Text");
    await page.getByRole("button", { name: "Add text" }).click();
    await axeClean(page, "phone text panel");
    await openTool(page, "Layers");
    await axeClean(page, "phone layers panel");
    await openTool(page, "Colour");
    await axeClean(page, "phone colour panel");
  });

  test("P-N6 on a short text layer the resize handles don't pile on top of each other", async ({ page }) => {
    await newProject(page);
    await openTool(page, "Text");
    await page.getByRole("button", { name: "Add text" }).click();
    await page.waitForTimeout(500);
    const centres = await page.evaluate(() => {
      const tr = (window as any).Konva.stages[0].find("Transformer")[0];
      const out: { name: string; x: number; y: number; size: number }[] = [];
      for (const n of ["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]) {
        const a = tr.findOne("." + n);
        if (a && a.isVisible()) {
          const p = a.getAbsolutePosition();
          out.push({ name: n, x: p.x, y: p.y, size: a.width() });
        }
      }
      return out;
    });
    expect(centres.length, "a small layer should keep at least two handles").toBeGreaterThanOrEqual(2);
    let closest = Infinity;
    for (let i = 0; i < centres.length; i++)
      for (let j = i + 1; j < centres.length; j++) closest = Math.min(closest, Math.hypot(centres[i].x - centres[j].x, centres[i].y - centres[j].y));
    const size = centres[0].size;
    expect(closest, `two handles are ${closest.toFixed(0)}px apart but each is ${size}px wide, so they overlap and can't be told apart`).toBeGreaterThanOrEqual(size);

    // zoomed in, the layer is big enough for the full set again
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const tr = (window as any).Konva.stages[0].find("Transformer")[0];
      return ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"].filter((n) => tr.findOne("." + n)?.isVisible()).length;
    });
    expect(after).toBe(6);
  });
});
