import { expect, test } from "@playwright/test";

const storyUrl = (story: string) =>
  `/iframe.html?id=perspectives-sidebar-modules--${story}&viewMode=story`;
const fileTreeStoryUrl = (story: string) =>
  `/iframe.html?id=navigation-filetree--${story}&viewMode=story`;

function treeSection(page: import("@playwright/test").Page, title: string) {
  return page.locator(".sidebar-section").filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });
}

test("Writing switcher selects Workspace and keyboard returns to Writing", async ({ page }) => {
  await page.goto(storyUrl("writing-composition"));
  await expect(page.getByRole("heading", { name: "Writing", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace", level: 1 })).toBeVisible();
  await expect(page.getByText("Perspectives", { exact: true })).toHaveCount(0);

  await page.keyboard.press("Meta+Alt+ArrowRight");
  await expect(page.getByRole("heading", { name: "Writing", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Writing", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("keyboard switching returns from target without switcher", async ({ page }) => {
  await page.goto(storyUrl("perspective-switcher-target-without-control"));
  await expect(page.getByRole("heading", { name: "Daily work", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Focus (without switcher)", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Focus (without switcher)", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Perspectives", { exact: true })).toHaveCount(0);

  await page.keyboard.press("Meta+Alt+ArrowLeft");
  await expect(page.getByRole("heading", { name: "Daily work", level: 1 })).toBeVisible();
});

test("switches without a switcher and restores each Perspective's tree state on A-to-B-to-A", async ({
  page,
}) => {
  await page.goto(storyUrl("independent-tree-state"));
  const dailyFiles = treeSection(page, "Daily files");
  await expect(page.getByRole("heading", { name: "Daily work", level: 1 })).toBeVisible();
  await expect(page.getByText("Perspectives", { exact: true })).toHaveCount(0);

  await dailyFiles.getByText("Expand", { exact: true }).click();
  await expect(dailyFiles.getByText("inbox.md", { exact: true })).toBeVisible();

  await page.keyboard.press("Meta+Alt+ArrowRight");
  await expect(page.getByRole("heading", { name: "Writing", level: 1 })).toBeVisible();
  const writingFiles = treeSection(page, "Writing files");
  await expect(writingFiles.getByText("Expand", { exact: true })).toBeVisible();
  await writingFiles.getByText("Expand", { exact: true }).click();
  await expect(writingFiles.getByText("inbox.md", { exact: true })).toBeVisible();

  await page.keyboard.press("Meta+Alt+ArrowLeft");
  await expect(page.getByRole("heading", { name: "Daily work", level: 1 })).toBeVisible();
  await expect(dailyFiles.getByText("inbox.md", { exact: true })).toBeVisible();

  await page.keyboard.press("Meta+Alt+ArrowRight");
  await expect(page.getByRole("heading", { name: "Writing", level: 1 })).toBeVisible();
  await expect(writingFiles.getByText("inbox.md", { exact: true })).toBeVisible();
});

test("keeps file-tree instance collapse state independent", async ({ page }) => {
  await page.goto(storyUrl("file-tree-multiple-instances"));
  const allNotes = treeSection(page, "All Notes");
  const projectFiles = treeSection(page, "Project Files");

  // This fixture starts with a project file active, so reveal opens Project Files first.
  await projectFiles.getByText("Collapse", { exact: true }).click();
  await expect(projectFiles.getByText("Expand", { exact: true })).toBeVisible();

  await allNotes.getByText("Expand", { exact: true }).click();
  await expect(allNotes.getByText("inbox.md", { exact: true })).toBeVisible();
  await expect(projectFiles.getByText("Expand", { exact: true })).toBeVisible();
  await expect(projectFiles.getByText("octarine", { exact: true })).toHaveCount(0);

  await projectFiles.getByText("Expand", { exact: true }).click();
  await expect(projectFiles.getByText("octarine", { exact: true })).toBeVisible();
  await allNotes.getByText("Collapse", { exact: true }).click();

  await expect(allNotes.getByText("inbox.md", { exact: true })).toHaveCount(0);
  await expect(projectFiles.getByText("octarine", { exact: true })).toBeVisible();
});

test("re-reveals earlier tree after document navigation A-to-B-to-A", async ({ page }) => {
  await page.goto(storyUrl("reveal-owner-transitions"));
  const allFiles = treeSection(page, "All files");
  const projectFiles = treeSection(page, "Project files");

  await page.getByRole("button", { name: "Open inbox note", exact: true }).click();
  await expect(allFiles.getByText("inbox.md", { exact: true })).toBeVisible();
  await allFiles.getByText("Collapse", { exact: true }).click();
  await expect(allFiles.getByText("Expand", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open project roadmap", exact: true }).click();
  await expect(projectFiles.getByText("roadmap.md", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open inbox note", exact: true }).click();

  await expect(allFiles.getByText("inbox.md", { exact: true })).toBeVisible();
  await expect(projectFiles.getByText("roadmap.md", { exact: true })).toBeVisible();
});

test("reveals active file in most-specific matching tree only", async ({ page }) => {
  await page.goto(storyUrl("reveal-owner-transitions"));
  const allFiles = treeSection(page, "All files");
  const projectFiles = treeSection(page, "Project files");

  await page.getByRole("button", { name: "Open project roadmap", exact: true }).click();
  await expect(projectFiles.getByText("roadmap.md", { exact: true })).toBeVisible();
  await expect(allFiles.getByText("Expand", { exact: true })).toBeVisible();
  await expect(allFiles.getByText("roadmap.md", { exact: true })).toHaveCount(0);
});

test("keeps reveal with tree that opened file, even when another root is deeper", async ({
  page,
}) => {
  await page.goto(storyUrl("source-owned-reveal"));
  const allFiles = treeSection(page, "All files");
  const projectFiles = treeSection(page, "Project files");

  await page
    .getByRole("button", { name: "Open project roadmap from All files", exact: true })
    .click();
  await expect(allFiles.getByText("roadmap.md", { exact: true })).toBeVisible();
  await expect(projectFiles.getByText("Expand", { exact: true })).toBeVisible();
  await expect(projectFiles.getByText("roadmap.md", { exact: true })).toHaveCount(0);
});

test("shows unavailable-root error while file tree stays collapsed", async ({ page }) => {
  await page.goto(storyUrl("file-tree-root-unavailable"));
  const fileTree = treeSection(page, "Notes");

  await expect(fileTree.getByText("Expand", { exact: true })).toBeVisible();
  await expect(fileTree.getByRole("status")).toHaveText(
    'Perspective "File Tree" references workspace root "vault" which is not available.',
  );
});

test("opens and dismisses Perspective navigation drawer on narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 840 });
  await page.goto(storyUrl("narrow-sidebar"));

  const navigation = page.getByRole("complementary", { name: "Octarine navigation" });
  await expect(navigation).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(navigation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
});

test("controlled FileTree collapse trigger allows folders to reopen", async ({ page }) => {
  await page.goto(fileTreeStoryUrl("controlled-collapse-reopen"));
  await expect(page.getByText("Roadmap.md", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Collapse all folders" }).click();
  await expect(page.getByText("Roadmap.md", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reopen all folders" }).click();

  await expect(page.getByText("Roadmap.md", { exact: true })).toBeVisible();
});
