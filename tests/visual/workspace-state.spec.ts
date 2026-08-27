import { expect, test } from "@playwright/test";

const storyUrl = (story: string) =>
  `/iframe.html?id=states-workspacestate--${story}&viewMode=story`;

test.describe("Workspace state visual regression", () => {
  for (const [story, snapshot] of [
    ["empty", "empty.png"],
    ["loading", "loading.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 960, height: 640 });
      await page.goto(storyUrl(story));
      await expect(page.locator(".empty-state")).toHaveScreenshot(snapshot);
    });
  }
});
