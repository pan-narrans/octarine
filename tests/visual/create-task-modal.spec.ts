import { expect, test, type Page } from "@playwright/test";

const createStoryUrl = (story: string) =>
  `/iframe.html?id=tasks-createtaskmodal--${story}&viewMode=story`;
const notificationStoryUrl = (story: string) =>
  `/iframe.html?id=feedback-notificationviewport--${story}&viewMode=story`;

async function expectCreateStory(page: Page, story: string, name: string) {
  await page.goto(createStoryUrl(story));
  await expect(page.getByRole("dialog", { name: "New Task" })).toHaveScreenshot(name);
}

async function expectNotificationStory(page: Page, story: string, name: string) {
  await page.goto(notificationStoryUrl(story));
  await expect(page.getByLabel("Notifications")).toHaveScreenshot(name);
}

test.describe("CreateTaskModal visual regression", () => {
  test("quick capture", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await expectCreateStory(page, "playground", "quick-capture-desktop.png");
  });

  test("expanded inherited project", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await expectCreateStory(
      page,
      "expanded-inherited-project",
      "expanded-inherited-project-desktop.png",
    );
  });

  test("mobile expanded", async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 1024 });
    await expectCreateStory(page, "mobile-expanded", "mobile-expanded.png");
  });

  test("successful create closes modal", async ({ page }) => {
    await page.goto(createStoryUrl("playground"));
    await page.getByRole("button", { name: "Create Task" }).click();

    await expect(page.getByRole("dialog", { name: "New Task" })).toBeHidden();
    await expect(page.getByRole("status")).toContainText("Task created");
  });
});

test.describe("NotificationViewport visual regression", () => {
  test("success", async ({ page }) => {
    await expectNotificationStory(page, "success", "success-desktop.png");
  });

  test("information", async ({ page }) => {
    await expectNotificationStory(page, "information", "information-desktop.png");
  });

  test("warning", async ({ page }) => {
    await expectNotificationStory(page, "warning", "warning-desktop.png");
  });

  test("error", async ({ page }) => {
    await expectNotificationStory(page, "error", "error-desktop.png");
  });

  test("partial success warning", async ({ page }) => {
    await expectNotificationStory(
      page,
      "partial-success-warning",
      "partial-success-warning-desktop.png",
    );
  });

  test("bounded stack", async ({ page }) => {
    await expectNotificationStory(page, "stack", "stack-desktop.png");
  });

  test("mobile information", async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 1024 });
    await expectNotificationStory(page, "mobile-information", "mobile-information.png");
  });
});
