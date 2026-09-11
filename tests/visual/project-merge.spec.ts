import { expect, test, type Page } from "@playwright/test";

const mergeStoryUrl = (story: string) =>
  `/iframe.html?id=tasks-projectmergeworkflow--${story}&viewMode=story`;
const recoveryStoryUrl = (story: string) =>
  `/iframe.html?id=settings-projectmergerecovery--${story}&viewMode=story`;

async function expectMerge(page: Page, story: string, snapshot: string) {
  await page.goto(mergeStoryUrl(story));
  await expect(page.getByRole("dialog")).toHaveScreenshot(snapshot);
}

test.describe("Project merge workflow visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
  });

  for (const story of [
    "merge-offer",
    "ancestor-blocker",
    "clean-plan",
    "markdown",
    "file",
    "ignored",
    "bulk-confirmation",
    "preparing",
    "commit-boundary",
    "partial-recovery",
    "success",
  ]) {
    test(story, async ({ page }) => {
      await expectMerge(page, story, `${story}.png`);
    });
  }

  test("narrow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectMerge(page, "narrow", "narrow.png");
  });
});

test.describe("Project merge recovery visual regression", () => {
  test("bundles", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await page.goto(recoveryStoryUrl("bundles"));
    await expect(page.getByRole("region", { name: "Project merge recovery" })).toHaveScreenshot(
      "recovery-bundles.png",
    );
  });

  test("narrow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(recoveryStoryUrl("narrow"));
    await expect(page.getByRole("region", { name: "Project merge recovery" })).toHaveScreenshot(
      "recovery-narrow.png",
    );
  });
});
