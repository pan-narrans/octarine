import { expect, test } from "@playwright/test";

const storyUrl = (story: string) =>
  `/iframe.html?id=calendar-calendarsurface--${story}&viewMode=story`;

test.describe("Calendar visual regression", () => {
  for (const [story, snapshot] of [
    ["month", "month.png"],
    ["week", "week.png"],
    ["month-narrow", "month-narrow.png"],
    ["week-narrow", "week-narrow.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize(
        story.endsWith("narrow") ? { width: 360, height: 900 } : { width: 1280, height: 900 },
      );
      await page.goto(storyUrl(story));
      await expect(page.locator(".calendar-surface")).toHaveScreenshot(snapshot);
    });
  }
});
