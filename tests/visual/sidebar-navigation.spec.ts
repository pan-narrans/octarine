import { expect, test } from "@playwright/test";

const storyUrl = (story: string) =>
  `/iframe.html?id=navigation-sidebarnavigation--${story}&viewMode=story`;

test.describe("Sidebar navigation visual regression", () => {
  for (const [story, snapshot] of [
    ["default", "default.png"],
    ["project-selected", "project-selected.png"],
    ["context-selected", "context-selected.png"],
    ["beta-channel", "beta-channel.png"],
    ["project-rename-available", "project-rename-available.png"],
    ["project-rename-editing", "project-rename-editing.png"],
    ["inactive-projects-hidden", "inactive-projects-hidden.png"],
    ["all-projects-inactive", "all-projects-inactive.png"],
    ["inactive-projects-revealed", "inactive-projects-revealed.png"],
    ["selected-inactive-project", "selected-inactive-project.png"],
    ["active-descendant-project", "active-descendant-project.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 840 });
      await page.goto(storyUrl(story));
      await expect(
        page.getByRole("complementary", { name: "Octarine navigation" }),
      ).toHaveScreenshot(snapshot);
    });
  }
});

test("opens and dismisses collapsed navigation", async ({ page }) => {
  await page.setViewportSize({ width: 711, height: 900 });
  await page.goto(storyUrl("default"));

  const navigation = page.getByRole("complementary", { name: "Octarine navigation" });
  await expect(navigation).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(navigation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
});

test.describe("Collapsed sidebar visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 840 });
  });

  test("closed", async ({ page }) => {
    await page.goto(storyUrl("mobile-closed"));
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    await expect(page).toHaveScreenshot("mobile-closed.png");
  });

  test("open", async ({ page }) => {
    await page.goto(storyUrl("mobile-closed"));
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("complementary", { name: "Octarine navigation" })).toBeVisible();
    await expect(page).toHaveScreenshot("mobile-open.png");
  });

  test("beta channel open", async ({ page }) => {
    await page.goto(storyUrl("beta-channel-mobile-open"));
    await expect(page.getByRole("complementary", { name: "Octarine navigation" })).toBeVisible();
    await expect(page).toHaveScreenshot("beta-channel-mobile-open.png");
  });
});

test("selects a navigation item", async ({ page }) => {
  await page.goto(storyUrl("interactive"));
  await page.getByText("Schedule Events", { exact: true }).click();
  await expect(page.getByTestId("last-selection")).toHaveText("events");
});

test("submits inline project rename", async ({ page }) => {
  await page.goto(storyUrl("project-rename-editing"));
  const input = page.getByRole("textbox", { name: "New name for +product" });
  await expect(input).toHaveValue("platform");
  await page.getByRole("button", { name: "Confirm rename of +product" }).click();
  await expect(input).toBeHidden();
});

test("reveals and hides inactive projects", async ({ page }) => {
  await page.goto(storyUrl("visibility-interactive"));
  const toggle = page.getByRole("button", { name: "Show inactive" });

  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("archive", { exact: true })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("archive", { exact: true })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("archive", { exact: true })).toBeHidden();
});
