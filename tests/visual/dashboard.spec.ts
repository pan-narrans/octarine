import { expect, test } from "@playwright/test";

const storyUrl = (story: string) => `/iframe.html?id=dashboard-dashboard--${story}&viewMode=story`;

test.describe("Dashboard visual regression", () => {
  for (const [story, snapshot] of [
    ["default", "default.png"],
    ["quiet", "quiet.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(storyUrl(story));
      await expect(page.locator(".unified-dashboard")).toHaveScreenshot(snapshot);
    });
  }
});
