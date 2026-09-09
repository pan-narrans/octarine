import { expect, test } from "@playwright/test";

const storyUrl = (story: string) => `/iframe.html?id=kanban-kanbanboard--${story}&viewMode=story`;

test.describe("Kanban visual regression", () => {
  for (const [story, snapshot] of [
    ["populated", "populated.png"],
    ["closed-columns", "closed-columns.png"],
    ["empty", "empty.png"],
    ["error-rollback", "error-rollback.png"],
  ]) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(storyUrl(story));
      await expect(page.getByRole("main")).toHaveScreenshot(snapshot);
    });
  }

  test("narrow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(storyUrl("narrow"));
    await expect(page.getByRole("main")).toHaveScreenshot("narrow.png");
  });

  test("shows done date without a redundant status label", async ({ page }) => {
    await page.goto(storyUrl("populated"));
    const task = page.getByRole("button", { name: "Edit task: Document task syntax" });

    await expect(task.locator(".done-icon-top")).toBeVisible();
    await expect(task.locator(".task-done-top")).toHaveText("Sep 5, 2026");
  });

  test("large groups mount bounded rows and remain scrollable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(storyUrl("large-group"));
    const virtualList = page.locator(".kanban-card-list.virtualized");
    await expect(virtualList).toBeVisible();
    expect(await page.locator(".kanban-card").count()).toBeLessThan(30);

    await virtualList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole("button", { name: "Edit task: Project task 55" })).toBeVisible();
  });

  test("drags card onto status column", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(storyUrl("interactive"));
    const card = page.locator(".kanban-card", { hasText: "Confirm migration window" });
    const doing = page.getByRole("region", { name: "Doing", exact: true });

    await card.dragTo(doing.locator(".kanban-column-content"));

    await expect(
      doing.getByRole("button", { name: "Edit task: Confirm migration window" }),
    ).toBeVisible();
    await expect(doing.getByRole("region", { name: "Context call" })).toBeVisible();
  });

  test("drags card onto named context group", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(storyUrl("interactive"));
    const card = page.locator(".kanban-card", { hasText: "Write Kanban interaction spec" });
    const anaGroup = page.getByRole("region", { name: "Context ana" });

    await card.dragTo(anaGroup);

    await expect(
      anaGroup.getByRole("button", { name: "Edit task: Write Kanban interaction spec" }),
    ).toBeVisible();
  });

  test("commits from drag-end when WebKit omits drop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(storyUrl("interactive"));
    const card = page.locator(".kanban-card", { hasText: "Confirm migration window" });
    const doing = page.getByRole("region", { name: "Doing", exact: true });
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

    await card.dispatchEvent("dragstart", { dataTransfer });
    await doing.locator(".kanban-column-content").dispatchEvent("dragover", { dataTransfer });
    await card.dispatchEvent("dragend", { dataTransfer });

    await expect(
      doing.getByRole("button", { name: "Edit task: Confirm migration window" }),
    ).toBeVisible();
  });
});
