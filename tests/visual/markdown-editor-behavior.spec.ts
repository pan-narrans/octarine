import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/iframe.html?id=editors-markdowneditor--persistence&viewMode=story");
  await expect(page.locator(".cm-content")).toContainText("# Original note");
});

test("save transitions from dirty through pending to persisted content on reopen", async ({
  page,
}) => {
  const editor = page.locator(".cm-content");
  const save = page.getByRole("button", { name: "Save (Cmd+S)", exact: true });
  await expect(save).toBeDisabled();
  await editor.fill("# Edited café note");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await save.click();
  await expect(page.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Persisted content")).toHaveText("# Original note");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();
  await expect(page.getByTitle("Unsaved changes")).toHaveCount(0);
  await expect(page.getByLabel("Persisted content")).toHaveText("# Edited café note");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Reopen note", exact: true }).click();
  await expect(editor).toContainText("# Edited café note");
  await expect(save).toBeDisabled();
});

test("rejected save retains dirty text and supports retry", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("Unsaved work");
  await editor.press("ControlOrMeta+s");
  await expect(page.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reject save", exact: true }).click();
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await expect(editor).toContainText("Unsaved work");
  await expect(page.getByLabel("Persisted content")).toHaveText("# Original note");
  await page.getByRole("button", { name: "Save (Cmd+S)", exact: true }).click();
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(page.getByLabel("Persisted content")).toHaveText("Unsaved work");
  await expect(page.getByTitle("Unsaved changes")).toHaveCount(0);
});

test("pending save retains newer edits and next save uses acknowledged snapshot", async ({
  page,
}) => {
  const editor = page.locator(".cm-content");
  await editor.fill("First edit");
  await editor.press("ControlOrMeta+s");
  await editor.fill("Newer unsaved edit");
  await editor.press("ControlOrMeta+s");
  await expect(page.getByLabel("Save calls")).toHaveText("1");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(editor).toContainText("Newer unsaved edit");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await expect(page.getByLabel("Persisted content")).toHaveText("First edit");
  await editor.press("ControlOrMeta+s");
  await expect(page.getByLabel("Original snapshot")).toHaveText("First edit");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(page.getByTitle("Unsaved changes")).toHaveCount(0);
  await expect(page.getByLabel("Persisted content")).toHaveText("Newer unsaved edit");
});

test("late save completion cannot reset another document's dirty state", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("Saved in original note");
  await editor.press("ControlOrMeta+s");
  await page.getByRole("button", { name: "Switch note" }).click();
  await expect(editor).toContainText("# Other note");
  await editor.fill("Other unsaved work");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(editor).toContainText("Other unsaved work");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await expect(page.getByLabel("Persisted content")).toHaveText("# Other note");
  await editor.press("ControlOrMeta+s");
  await expect(page.getByLabel("Original snapshot")).toHaveText("# Other note");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(page.getByLabel("Persisted content")).toHaveText("Other unsaved work");
});

test("external refresh preserves dirty text and its original save precondition", async ({
  page,
}) => {
  const editor = page.locator(".cm-content");
  await editor.fill("Local unsaved work");
  await page.getByRole("button", { name: "External edit" }).click();
  await expect(editor).toContainText("Local unsaved work");
  await editor.press("ControlOrMeta+s");
  await expect(page.getByLabel("Original snapshot")).toHaveText("# Original note");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await expect(page.getByLabel("Persisted content")).toHaveText("# External edit");
  await expect(editor).toContainText("Local unsaved work");
});
