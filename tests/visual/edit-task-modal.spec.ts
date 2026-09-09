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

  test("native window keeps save action reachable", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(storyUrl("default"));

    await expect(page.getByRole("button", { name: "Save Changes" })).toBeInViewport();
    await expect(page.getByRole("dialog", { name: "Edit Task" })).toHaveScreenshot(
      "native-window.png",
    );
  });

  test("opens DOM dropdowns and changes values", async ({ page }) => {
    await page.goto(storyUrl("default"));

    const status = page.getByLabel("Status", { exact: true });
    await status.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Edit Task" })).toHaveScreenshot(
      "dropdown-open.png",
    );
    await page.getByRole("option", { name: "Deferred" }).click();
    await expect(status).toHaveText("Deferred");

    const priority = page.getByLabel("Priority", { exact: true });
    await priority.click();
    await page.getByRole("option", { name: "Medium (B)" }).click();
    await expect(priority).toHaveText("Medium (B)");
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
