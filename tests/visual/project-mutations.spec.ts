import { expect, test, type Page } from "@playwright/test";

const storyUrl = (component: string, story: string) =>
  `/iframe.html?id=tasks-${component}--${story}&viewMode=story`;

async function expectDialog(page: Page, component: string, story: string, snapshot: string) {
  await page.goto(storyUrl(component, story));
  await expect(page.getByRole("alertdialog")).toHaveScreenshot(snapshot);
}

test.describe("Project move confirmation visual regression", () => {
  for (const story of ["project-to-project", "remove-project", "root-only", "moving"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 1024 });
      await expectDialog(page, "projectmoveconfirmation", story, `move-${story}.png`);
    });
  }

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectDialog(page, "projectmoveconfirmation", "mobile", "move-mobile.png");
  });
});

test.describe("Project rename confirmation visual regression", () => {
  for (const story of ["hierarchy", "case-only", "collision", "renaming", "partial-failure"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 1024 });
      await expectDialog(page, "projectrenameconfirmation", story, `rename-${story}.png`);
    });
  }

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectDialog(page, "projectrenameconfirmation", "mobile", "rename-mobile.png");
  });
});
