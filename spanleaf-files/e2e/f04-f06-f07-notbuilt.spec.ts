import { test, expect, signIn } from "./fixtures";

// F04 layers, F06 upgrade and F07 share-template are not built yet. These tests record exactly what is
// missing, and they keep the stub screens honest until the real ones arrive.

test.describe("F04 reorder and lock layers (milestone 2, not built)", () => {
  test.fixme("F04-H1 open the layers panel, drag a layer up, lock it", async () => {});
  test.fixme("F04-E1 reorder with Alt+Arrow keys and hear it announced", async () => {});
  test.fixme("F04-E2 tapping a locked element on the canvas does nothing", async () => {});
});

test.describe("F06 upgrade (billing screens not built)", () => {
  test("F06-E1 the pricing page's plan cards work with the keyboard", async ({ page }) => {
    await page.goto("/pricing");
    const premium = page.getByRole("radio", { name: /^Studio/ });
    const basic = page.getByRole("radio", { name: /^Free/ });
    await expect(premium).toBeChecked();
    await basic.click();
    await expect(basic).toBeChecked();
    await expect(premium).not.toBeChecked();
    await basic.focus();
    await page.keyboard.press("Space");
    await expect(basic).toBeChecked();
  });
  test("F06-E2 the upgrade and welcome screens are honest stubs and don't throw", async ({ page }) => {
    await signIn(page);
    await page.goto("/upgrade");
    await expect(page.getByText("isn't built yet")).toBeVisible();
    await page.goto("/onboarding");
    await expect(page.getByText("isn't built yet")).toBeVisible();
  });
  test.fixme("F06-H1 start the free trial with Stripe test card 4242 4242 4242 4242 (manual, needs live Stripe)", async () => {});
  test.fixme("F06-N1 declined card 4000 0000 0000 0002 shows an error and creates no subscription (manual)", async () => {});
});

test.describe("F07 share a template (milestone 6, not built)", () => {
  test.fixme("F07-H1 publish a project as a template", async () => {});
});
