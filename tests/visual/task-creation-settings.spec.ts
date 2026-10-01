import { expect, test, type Page } from "@playwright/test";

const storyUrl = (story: string) =>
  `/iframe.html?id=settings-taskcreationsettings--${story}&viewMode=story`;

async function expectStory(page: Page, story: string, snapshot: string) {
  await page.goto(storyUrl(story));
  await expect(page.getByRole("region", { name: "Task creation" })).toHaveScreenshot(snapshot);
}

test.describe("TaskCreationSettings visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
  });

  test("valid", async ({ page }) => {
    await expectStory(page, "playground", "valid-desktop.png");
  });

  test("invalid", async ({ page }) => {
    await expectStory(page, "invalid", "invalid-desktop.png");
  });

  test("migration required", async ({ page }) => {
    await expectStory(page, "migration-required", "migration-required-desktop.png");
  });

  test("saving and saved", async ({ page }) => {
    await expectStory(page, "saving", "saving-desktop.png");
    await expectStory(page, "saved", "saved-desktop.png");
  });

  test("project template", async ({ page }) => {
    await expectStory(page, "project-template", "project-template-desktop.png");
  });

  test("marker and end-of-file insertion", async ({ page }) => {
    await expectStory(page, "marker-insertion", "marker-insertion-desktop.png");
    await expectStory(page, "end-of-file-insertion", "end-of-file-insertion-desktop.png");
  });

  test("narrow", async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 1200 });
    await expectStory(page, "narrow", "narrow.png");
  });
});
