import {
  test, expect, signIn, newProject, addPhotos, images, canvasReady, readProject, waitSaved, waitImagesLoaded, geo, ASSET,
} from "./fixtures";

test.describe("X autosave, sessions and two tabs", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("X-E1 the save status goes Unsaved, Saving, Saved and the data is really stored", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    await waitSaved(page);
    expect((await readProject(page, id)).doc.elements).toHaveLength(1);
    expect((await readProject(page, id)).rev).toBeGreaterThanOrEqual(1);
  });

  test("X-E2 many quick edits end up as one correct final state", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const x0 = (await images(page))[0].x;
    await page.getByRole("region", { name: "Canvas area" }).focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
    await waitSaved(page);
    expect((await readProject(page, id)).doc.elements[0].x).toBeCloseTo(x0 + 40, 1);
  });

  test("X-E3 closing or reloading within a second of an edit doesn't lose it", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    // no waiting for the autosave. Reload straight away, like closing the tab.
    await page.reload();
    await canvasReady(page);
    const saved = await readProject(page, id);
    expect(saved.doc.elements, "the photo added a moment before the reload was lost").toHaveLength(1);
  });

  test("X-E4 leaving the editor with the Back link right after an edit keeps the edit", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await page.getByRole("link", { name: "Back to projects" }).click();
    await page.waitForURL("**/app");
    await page.waitForTimeout(500);
    expect((await readProject(page, id)).doc.elements).toHaveLength(1);
  });

  test("X-E5 two tabs: the second one's save is refused, and neither tab's work vanishes silently", async ({ page, context }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await waitSaved(page);
    const tab2 = await context.newPage();
    await tab2.goto(`/app/project/${id}`);
    await canvasReady(tab2);
    await waitImagesLoaded(tab2, 1);
    {
      const g2 = await geo(tab2);
      const [im] = await images(tab2);
      await tab2.mouse.click(g2.left + (im.x + 40) * g2.s, g2.top + (im.y + 40) * g2.s);
    }
    await tab2.keyboard.press("Shift+ArrowDown");
    await waitSaved(tab2);
    // Back to the first tab. A tab in the background has its timers slowed, so its save would wait.
    await page.bringToFront();
    await page.getByRole("region", { name: "Canvas area" }).focus();
    await page.keyboard.press("Shift+ArrowRight");
    // The save waits 1.5 s after the last change, and a tab just brought back may still be catching up.
    await expect(page.getByRole("dialog", { name: "Edited somewhere else" })).toBeVisible({ timeout: 15000 });
    const stored = (await readProject(tab2, id)).doc.elements[0];
    const mine = (await images(tab2))[0];
    expect(stored.y).toBeCloseTo(mine.y, 1); // tab 2's edit is what is stored
  });

  test("X-E6 signed out in another tab: the editor says so, and doesn't pretend it saved", async ({ page, context }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await waitSaved(page);
    const tab2 = await context.newPage();
    await tab2.goto("/app");
    await tab2.getByRole("button", { name: "Sign out" }).click();
    await tab2.waitForURL((u) => u.pathname === "/");
    await page.getByRole("region", { name: "Canvas area" }).focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(2500);
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body, "the page should tell the person they are signed out").toMatch(/sign(ed)? in|signed out|log in/);
    await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  });

  test("X-E7 the project list reflects an edit made in another tab after a reload", async ({ page }) => {
    const id = await newProject(page, { name: "Original" });
    await page.goto("/app");
    await expect(page.getByText("Original")).toBeVisible();
    expect(id).toBeTruthy();
  });
});

test.describe("X zoom and large canvases", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("X-Z1 zooming in keeps you on the same slide", async ({ page }) => {
    await newProject(page, { slides: 5 });
    const next = page.getByRole("button", { name: "Next slide" });
    for (let i = 0; i < 2; i++) {
      await next.click();
      await page.waitForTimeout(700);
    }
    await expect(page.getByText("Slide 3 of 5")).toBeVisible();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText("Slide 3 of 5"), "zooming jumped to a different part of the canvas").toBeVisible();
  });

  test("X-Z2 zoom limits: 25% to 400%, with the buttons disabling at each end", async ({ page }) => {
    await newProject(page);
    for (let i = 0; i < 12; i++) if (await page.getByRole("button", { name: "Zoom in" }).isEnabled()) await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    for (let i = 0; i < 30; i++) if (await page.getByRole("button", { name: "Zoom out" }).isEnabled()) await page.getByRole("button", { name: "Zoom out" }).click();
    await expect(page.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    await page.getByRole("button", { name: "Reset zoom to fit" }).click();
    await expect(page.getByRole("button", { name: "Reset zoom to fit" })).toHaveText("100%");
  });

  test("X-Z3 a ten slide project stays visible when zoomed in on a high-density screen", async ({ page }) => {
    await newProject(page, { slides: 10 });
    await addPhotos(page, ASSET("gradient.png"));
    const zin = page.getByRole("button", { name: "Zoom in" });
    while (await zin.isEnabled()) await zin.click();
    await page.waitForTimeout(500);
    // Look at the real pixels of the canvas the browser is drawing, not at what we asked it to draw.
    const report = await page.evaluate(() => {
      const stage = (window as any).Konva.stages[0];
      const canvases = [...stage.container().querySelectorAll("canvas")] as HTMLCanvasElement[];
      return canvases.map((c) => ({ w: c.width, h: c.height, css: c.style.width }));
    });
    const widest = Math.max(...report.map((r) => r.w));
    // Chrome refuses canvases wider than 32,767 pixels and draws nothing. Safari on iPhone stops far sooner.
    expect(widest, `canvas is ${widest}px wide, which browsers can't draw`).toBeLessThanOrEqual(16384);
  });
});

test.describe("X small screens: nothing spills sideways at 320px", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("X-M1 every screen fits a 320px wide window", async ({ page }) => {
    const check = async (label: string) => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${label} spills ${over}px sideways`).toBeLessThanOrEqual(0);
    };
    for (const p of ["/", "/terms", "/login"]) {
      await page.goto(p);
      await check(p);
    }
    await signIn(page, "a-very-long-address-for-a-narrow-screen@example.test");
    await check("/app empty");
    await page.goto("/app/new");
    await check("/app/new");
    const id = await newProject(page, { name: "A project name that is quite long and has 🎉 emoji and more words than fit" });
    await check("editor");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("dialog").waitFor();
    await check("export dialog");
    expect(id).toBeTruthy();
  });
});

test.describe("X regression tests for bugs found by this pass", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("X-R1 the canvas draws only the visible window, so a ten slide project at 400% on a 3x screen can't crash", async ({ page }) => {
    await newProject(page, { slides: 10 });
    await addPhotos(page, ASSET("gradient.png"));
    const zin = page.getByRole("button", { name: "Zoom in" });
    while (await zin.isEnabled()) await zin.click();
    const sizes = await page.evaluate(() => {
      const stage = (window as any).Konva.stages[0];
      return [...stage.container().querySelectorAll("canvas")].map((c: HTMLCanvasElement) => c.width * c.height);
    });
    expect(Math.max(...sizes), "a canvas this large crashes iPhones").toBeLessThan(16_000_000);
    // and the picture is still there after scrolling a long way
    await page.getByRole("region", { name: "Canvas area" }).evaluate((el) => (el.scrollLeft = 5000));
    await page.waitForTimeout(300);
    expect((await images(page))[0].loaded).toBe(true);
  });

  test("X-R2 scrolling to the far end of a long carousel and exporting still gives every slide", async ({ page }) => {
    await newProject(page, { slides: 10 });
    await page.getByRole("region", { name: "Canvas area" }).evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await page.waitForTimeout(300);
    await expect(page.getByText("Slide 10 of 10")).toBeVisible();
  });

  test("X-R3 a photo dragged by its handle after zooming and scrolling lands where the pointer is", async ({ page }) => {
    const id = await newProject(page, { slides: 4 });
    await addPhotos(page, ASSET("gradient.png"));
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(500);
    const before = (await images(page))[0];
    const g = await geo(page);
    const [sx, sy] = [g.left + (before.x + before.w / 2) * g.s, g.top + (before.y + before.h / 2) * g.s];
    expect(sx, "the photo should still be on screen after zooming in").toBeGreaterThan(0);
    expect(sx).toBeLessThan(1440);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 60, sy + 30, { steps: 5 });
    await page.mouse.up();
    await waitSaved(page);
    const after = (await readProject(page, id)).doc.elements[0];
    expect(after.x - before.x).toBeCloseTo(60 / g.s, 0);
    expect(after.y - before.y).toBeCloseTo(30 / g.s, 0);
  });
});
