import { expect, test, type Page } from "@playwright/test";

const storyUrl = (story: string) =>
  `/iframe.html?id=settings-applicationupdatesettings--${story}&viewMode=story`;

async function expectStory(page: Page, story: string, snapshot: string) {
  await page.goto(storyUrl(story));
  await expect(page.getByRole("region", { name: "Application updates" })).toHaveScreenshot(
    snapshot,
  );
}

test.describe("ApplicationUpdateSettings visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("direct and available", async ({ page }) => {
    await expectStory(page, "direct", "direct.png");
    await expectStory(page, "available", "available.png");
  });

  test("unavailable", async ({ page }) => {
    await expectStory(page, "unconfigured", "unconfigured.png");
  });

  test("error", async ({ page }) => {
    await expectStory(page, "error", "error.png");
  });

  test("narrow available", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await expectStory(page, "narrow-available", "narrow-available.png");
  });
});
