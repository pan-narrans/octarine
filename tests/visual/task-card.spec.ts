import { expect, test, type Page } from "@playwright/test";

const storyUrl = (story: string) => `/iframe.html?id=tasks-taskcard--${story}&viewMode=story`;

async function expectTaskCardScreenshot(page: Page, story: string, name: string) {
  await page.goto(storyUrl(story));
  await expect(page.getByRole("button", { name: /^Edit task: Audit/ })).toHaveScreenshot(name);
}

test.describe("TaskCard visual regression", () => {
  test("default", async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 420 });
    await expectTaskCardScreenshot(page, "default", "default.png");
  });

  test("keyboard focus", async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 420 });
    await expectTaskCardScreenshot(page, "focused", "focused.png");
  });

  for (const [story, snapshot] of [
    ["done", "done.png"],
    ["cancelled", "cancelled.png"],
    ["notes", "notes.png"],
    ["nested-subtasks", "nested-subtasks.png"],
    ["dense-metadata", "dense-metadata.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 520, height: 520 });
      await expectTaskCardScreenshot(page, story, snapshot);
    });
  }

  test("narrow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 520 });
    await expectTaskCardScreenshot(page, "narrow", "narrow.png");
  });
});

test.describe("TaskCard interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(storyUrl("interactive"));
  });

  test("opens from a click", async ({ page }) => {
    await page.getByRole("button", { name: /^Edit task: Audit/ }).click();
    await expect(page.getByTestId("last-action")).toHaveText("Opened storybook-task-card");
  });

  test("opens from the keyboard", async ({ page }) => {
    const card = page.getByRole("button", { name: /^Edit task: Audit/ });
    await card.focus();
    await card.press("Enter");
    await expect(page.getByTestId("last-action")).toHaveText("Opened storybook-task-card");
  });

  test("changes status without opening the task", async ({ page }) => {
    const status = page.getByRole("button", { name: /^Change status for Audit/ });
    await status.click();
    await expect(page.getByTestId("last-action")).toHaveText("Status changed to doing");
    await expect(status).toHaveClass(/doing/);
  });

  test("changes status from the keyboard", async ({ page }) => {
    const status = page.getByRole("button", { name: /^Change status for Audit/ });
    await status.focus();
    await status.press("Space");
    await expect(page.getByTestId("last-action")).toHaveText("Status changed to doing");
    await expect(status).toHaveClass(/doing/);
  });
});
