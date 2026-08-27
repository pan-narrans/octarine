import { expect, test } from "@playwright/test";

test("shared controls reference", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1100 });
  await page.goto("/iframe.html?id=design-system-shared-controls--reference&viewMode=story");
  await expect(page.getByRole("main")).toHaveScreenshot("reference.png");
});
