import { test, expect, axeClean, signIn } from "./fixtures";

/**
 * Names that must never appear on the page, comma separated, for example AVOID_NAMES="Acme,Acme Inc".
 * They are passed in rather than written here, so this file doesn't contain them.
 */
function namesToAvoid(): string[] {
  return (process.env.AVOID_NAMES ?? "")
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
}

test.describe("F12 landing page", () => {
  test("F12-H1 one h1, the sections in order, and both buttons lead to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seamless carousels, made at your desk.");
    const h2s = await page.getByRole("heading", { level: 2 }).allTextContents();
    expect(h2s).toEqual(["A long carousel shouldn't be a fight", "How it works", "What you get", "Questions", "Make your first carousel."]);
    for (const l of await page.getByRole("link", { name: "Start a carousel" }).all()) await expect(l).toHaveAttribute("href", "/login");
    expect(await page.getByRole("link", { name: "Start a carousel" }).count()).toBe(2);
  });

  test("F12-H2 the hero image is the real editor, loads, has a description, and reserves its space", async ({ page }) => {
    await page.goto("/");
    const img = page.getByRole("img", { name: /editor showing one landscape picture/ });
    await expect(img).toBeVisible();
    const info = await img.evaluate((el: HTMLImageElement) => ({ ok: el.complete && el.naturalWidth > 0, w: el.getAttribute("width"), h: el.getAttribute("height") }));
    expect(info).toEqual({ ok: true, w: "1800", h: "1125" });
  });

  test("F12-P1 it says it is free, and shows no prices, plans or trial", async ({ page }) => {
    await page.goto("/");
    const text = await page.getByRole("main").innerText();
    expect(text).toContain("Every tool is free");
    expect(text).not.toMatch(/\$\d|per month|a month|\bStudio\b|\bPremium\b/i);
    await expect(page.getByRole("link", { name: /pricing/i })).toHaveCount(0);
  });

  test("F12-C1 no invented proof and no claims for things that aren't built", async ({ page }) => {
    await page.goto("/");
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const banned of ["trusted by", "loved by", "millions", "testimonial", "#1", "best-in-class", "unlimited", "award", "★", "5 stars", "swipe-through", "ai-powered", ...namesToAvoid()]) {
      expect(text, `the page says "${banned}"`).not.toContain(banned);
    }
    // features that don't exist yet must not be promised as if they do
    for (const unbuilt of ["video layer", "template library", "stickers", "frames", "post directly", "one-click cancel"]) {
      expect(text, `the page promises "${unbuilt}", which isn't built`).not.toContain(unbuilt);
    }
  });

  test("F12-C2 the sizes and limits on the page are the real ones", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("body").innerText();
    expect(text).toContain("1080 pixels wide");
    expect(text).toContain("25 MB");
    expect(text).toContain("Every tool is free");
    expect(text).toContain("Add as many slides as the project needs");
    expect(text).toContain("100 steps");
    expect(text).toContain("30 free fonts");
  });

  test("F12-F1 the questions open and close with the keyboard", async ({ page }) => {
    await page.goto("/");
    const q = page.getByText("Is there a watermark?");
    await q.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("No.", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText("No.", { exact: true })).toBeHidden();
  });

  test("F12-A1 accessibility, with every question open", async ({ page }) => {
    await page.goto("/");
    await axeClean(page, "landing, questions closed");
    for (const s of await page.locator("summary").all()) await s.click();
    await axeClean(page, "landing, questions open");
  });

  test("F12-L1 every link on the page goes somewhere that loads", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = [...new Set(await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)))];
    expect(hrefs.length).toBeGreaterThan(4);
    for (const h of hrefs) {
      expect(h.startsWith("/"), `${h} should be a link inside the site`).toBe(true);
      const r = await request.get(h);
      expect(r.status(), h).toBeLessThan(400);
    }
  });

  test("F12-S1 signing in from the page's button starts the real flow", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start a carousel" }).last().click();
    await page.waitForURL("**/login");
    await page.getByLabel("Email").fill("launch@example.test");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/app");
  });

  test("F12-W1 pages that link back to the home page don't download its hero image", async ({ page }) => {
    const hits: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("editor.webp")) hits.push(r.url());
    });
    for (const path of ["/login", "/terms"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(4200); // the browser only warns about an unused preload a few seconds after load
    }
    expect(hits, "a page that doesn't show the hero image fetched it anyway").toEqual([]);
  });

  test("F12-H3 the site header says only its name and one link, on every page, with no stray text", async ({ page }) => {
    for (const path of ["/", "/terms", "/privacy", "/contact"]) {
      await page.goto(path);
      const text = (await page.locator("header").first().innerText()).replace(/\s+/g, " ").trim();
      expect(text, `header text on ${path}`).toBe("Spanleaf Sign in");
    }
  });

  test("F12-T1 the page title and description say what the product is", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Spanleaf/);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc).toContain("1080 pixels wide");
  });
});

test.describe("F12 landing page on small screens", () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test("F12-M1 nothing spills sideways at 320px, even with the questions open", async ({ page }) => {
    await page.goto("/");
    for (const s of await page.locator("summary").all()) await s.click();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});

test("F12-R1 a signed-in visitor can still read the landing page", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
