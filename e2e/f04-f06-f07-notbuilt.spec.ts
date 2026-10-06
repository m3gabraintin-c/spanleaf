import { test, expect, signIn } from "./fixtures";

// F04 layers and F07 share-template are not built yet. These tests record exactly what is missing, and
// they keep the stub screens honest until the real ones arrive.

test.describe("F04 reorder and lock layers (milestone 2, not built)", () => {
  test.fixme("F04-H1 open the layers panel, drag a layer up, lock it", async () => {});
  test.fixme("F04-E1 reorder with Alt+Arrow keys and hear it announced", async () => {});
  test.fixme("F04-E2 tapping a locked element on the canvas does nothing", async () => {});
});

test.describe("the welcome screen", () => {
  test("F06-E2 the welcome screen is an honest stub and doesn't throw", async ({ page }) => {
    await signIn(page);
    await page.goto("/onboarding");
    await expect(page.getByText("isn't built yet")).toBeVisible();
  });
});

test.describe("there are no plans to buy", () => {
  test("F06-E1 the pricing, upgrade and refund pages are gone", async ({ page }) => {
    for (const path of ["/pricing", "/upgrade", "/refund"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });
});

test.describe("F07 share a template (milestone 6, not built)", () => {
  test.fixme("F07-H1 publish a project as a template", async () => {});
});
