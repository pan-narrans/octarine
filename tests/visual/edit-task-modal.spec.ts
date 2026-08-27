import { expect, test, type Page } from "@playwright/test";

const storyUrl = (story: string) => `/iframe.html?id=tasks-edittaskmodal--${story}&viewMode=story`;

async function expectStoryScreenshot(page: Page, story: string, name: string) {
  await page.goto(storyUrl(story));
  await expect(page.getByRole("dialog", { name: "Edit Task" })).toHaveScreenshot(name);
}

test.describe("EditTaskModal visual regression", () => {
  test("default desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await expectStoryScreenshot(page, "default", "default-desktop.png");
  });

  test("empty task", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await expectStoryScreenshot(page, "empty-task", "empty-task-desktop.png");
  });

  test("Markdown open", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await expectStoryScreenshot(page, "markdown-open", "markdown-open-desktop.png");
  });

  test("nested subtask selected", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await expectStoryScreenshot(page, "nested-subtask-selected", "nested-selected-desktop.png");
  });

  test("saving", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await expectStoryScreenshot(page, "saving", "saving-desktop.png");
  });

  test("tablet", async ({ page }) => {
    await page.setViewportSize({ width: 850, height: 1024 });
    await expectStoryScreenshot(page, "tablet", "tablet.png");
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 1024 });
    await expectStoryScreenshot(page, "mobile", "mobile.png");
  });
});
