import { expect, test } from "@playwright/test";

const storyUrl = (story: string) => `/iframe.html?id=navigation-filetree--${story}&viewMode=story`;

test.describe("File Tree visual regression", () => {
  for (const [story, snapshot] of [
    ["folder", "folder.png"],
    ["file", "file.png"],
    ["expanded", "expanded.png"],
    ["selected-file", "selected-file.png"],
    ["renaming", "renaming.png"],
    ["read-only", "read-only.png"],
    ["narrow", "narrow.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize(
        story === "narrow" ? { width: 360, height: 900 } : { width: 640, height: 520 },
      );
      await page.goto(storyUrl(story));
      await expect(page.locator(".file-tree-node").first()).toHaveScreenshot(snapshot);
    });
  }
});
