import { expect, test } from "@playwright/test";

const storyUrl = (story: string) =>
  `/iframe.html?id=navigation-sidebarnavigation--${story}&viewMode=story`;

test.describe("Sidebar navigation visual regression", () => {
  for (const [story, snapshot] of [
    ["default", "default.png"],
    ["project-selected", "project-selected.png"],
    ["context-selected", "context-selected.png"],
  ] as const) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 840 });
      await page.goto(storyUrl(story));
      await expect(
        page.getByRole("complementary", { name: "Octarine navigation" }),
      ).toHaveScreenshot(snapshot);
    });
  }
});

test("selects a navigation item", async ({ page }) => {
  await page.goto(storyUrl("interactive"));
  await page.getByText("Schedule Events", { exact: true }).click();
  await expect(page.getByTestId("last-selection")).toHaveText("events");
});
