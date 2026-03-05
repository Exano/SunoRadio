import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3001";

test.describe("Visualizer Styles", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    // Open the visualizer menu
    const toggle = page.locator("#viz-menu-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();
    await expect(page.locator("#dev-menu")).toBeVisible();
  });

  test("vaporwave is the default active style", async ({ page }) => {
    const vaporBtn = page.locator('button[data-fx="vaporwave"]');
    await expect(vaporBtn).toHaveClass(/active-fx/);

    // No other style should be active
    const disco = page.locator('button[data-fx="disco"]');
    const matrix = page.locator('button[data-fx="matrix"]');
    const party = page.locator('button[data-fx="party"]');
    const chill = page.locator('button[data-fx="chill"]');
    const rain = page.locator('button[data-fx="rain"]');
    await expect(disco).not.toHaveClass(/active-fx/);
    await expect(matrix).not.toHaveClass(/active-fx/);
    await expect(party).not.toHaveClass(/active-fx/);
    await expect(chill).not.toHaveClass(/active-fx/);
    await expect(rain).not.toHaveClass(/active-fx/);
  });

  test("only one style can be active at a time", async ({ page }) => {
    const disco = page.locator('button[data-fx="disco"]');
    const vaporwave = page.locator('button[data-fx="vaporwave"]');
    const party = page.locator('button[data-fx="party"]');

    // Click disco
    await disco.click();
    await expect(disco).toHaveClass(/active-fx/);
    await expect(vaporwave).not.toHaveClass(/active-fx/);
    await expect(party).not.toHaveClass(/active-fx/);

    // Click party — disco should deactivate
    await party.click();
    await expect(party).toHaveClass(/active-fx/);
    await expect(disco).not.toHaveClass(/active-fx/);
    await expect(vaporwave).not.toHaveClass(/active-fx/);

    // Click vaporwave — party should deactivate
    await vaporwave.click();
    await expect(vaporwave).toHaveClass(/active-fx/);
    await expect(party).not.toHaveClass(/active-fx/);
    await expect(disco).not.toHaveClass(/active-fx/);
  });

  test("styles are permanent — do not expire", async ({ page }) => {
    const matrix = page.locator('button[data-fx="matrix"]');
    const vaporwave = page.locator('button[data-fx="vaporwave"]');

    await matrix.click();
    await expect(matrix).toHaveClass(/active-fx/);
    await expect(vaporwave).not.toHaveClass(/active-fx/);

    // Wait 3 seconds — should still be active (not expired)
    await page.waitForTimeout(3000);
    await expect(matrix).toHaveClass(/active-fx/);
    await expect(vaporwave).not.toHaveClass(/active-fx/);
  });

  test("reset returns to vaporwave + bars", async ({ page }) => {
    // Switch to disco and scope
    await page.locator('button[data-fx="disco"]').click();
    await page.locator('button[data-fx="scope"]').click();

    await expect(page.locator('button[data-fx="disco"]')).toHaveClass(/active-fx/);
    await expect(page.locator('button[data-fx="scope"]')).toHaveClass(/active-fx/);

    // Hit reset
    await page.locator('button[data-fx="reset"]').click();

    await expect(page.locator('button[data-fx="vaporwave"]')).toHaveClass(/active-fx/);
    await expect(page.locator('button[data-fx="bars"]')).toHaveClass(/active-fx/);
    await expect(page.locator('button[data-fx="disco"]')).not.toHaveClass(/active-fx/);
    await expect(page.locator('button[data-fx="scope"]')).not.toHaveClass(/active-fx/);
  });

  test("switching styles does not affect visualizer mode", async ({ page }) => {
    // Switch to scope mode
    await page.locator('button[data-fx="scope"]').click();
    await expect(page.locator('button[data-fx="scope"]')).toHaveClass(/active-fx/);

    // Switch style to matrix — scope should remain active
    await page.locator('button[data-fx="matrix"]').click();
    await expect(page.locator('button[data-fx="matrix"]')).toHaveClass(/active-fx/);
    await expect(page.locator('button[data-fx="scope"]')).toHaveClass(/active-fx/);

    // Switch style to chill — scope should still remain
    await page.locator('button[data-fx="chill"]').click();
    await expect(page.locator('button[data-fx="chill"]')).toHaveClass(/active-fx/);
    await expect(page.locator('button[data-fx="scope"]')).toHaveClass(/active-fx/);
    await expect(page.locator('button[data-fx="matrix"]')).not.toHaveClass(/active-fx/);
  });
});
