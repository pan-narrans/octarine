import { expect, test } from "@playwright/test";

test("foundations reference", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1600 });
  await page.goto("/iframe.html?id=design-system-foundations--reference&viewMode=story");
  await expect(page.getByRole("main")).toHaveScreenshot("reference.png");
});
