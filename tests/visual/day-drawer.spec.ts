import { expect, test } from "@playwright/test";

const storyUrl = (story: string) => `/iframe.html?id=calendar-daydrawer--${story}&viewMode=story`;

test.describe("Day Drawer visual regression", () => {
  for (const [story, snapshot] of [
    ["default", "default.png"],
    ["editing", "editing.png"],
    ["empty", "empty.png"],
    ["narrow", "narrow.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize(
        story === "narrow" ? { width: 360, height: 900 } : { width: 1280, height: 900 },
      );
      await page.goto(storyUrl(story));
      await expect(page.locator(".day-drawer-overlay")).toHaveScreenshot(snapshot);
    });
  }
});
