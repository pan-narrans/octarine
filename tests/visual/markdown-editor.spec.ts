import { expect, test } from "@playwright/test";

const storyUrl = (story: string) =>
  `/iframe.html?id=editors-markdowneditor--${story}&viewMode=story`;

test.describe("Markdown editor visual regression", () => {
  for (const [story, snapshot] of [
    ["journal-entry", "journal-entry.png"],
    ["blank-journal", "blank-journal.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(storyUrl(story));
      await expect(page.locator(".editor-workspace")).toHaveScreenshot(snapshot);
    });
  }
});
