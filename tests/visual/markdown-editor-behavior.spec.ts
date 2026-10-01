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

test("close and navigation restore independent unsaved buffers", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("First draft");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "External edit" }).click();
  await page.getByRole("button", { name: "Reopen note" }).click();
  await expect(editor).toHaveText("First draft");
  await page.getByRole("button", { name: "Switch note" }).click();
  await editor.fill("Second draft");
  await page.getByRole("button", { name: "Switch note" }).click();
  await expect(editor).toHaveText("First draft");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await editor.press("ControlOrMeta+s");
  await expect(page.getByLabel("Original snapshot")).toHaveText("# Original note");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(editor).toHaveText("First draft");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Switch note" }).click();
  await expect(editor).toHaveText("Second draft");
});

test("reopening pending save preserves newer edits and prevents duplicate writes", async ({
  page,
}) => {
  const editor = page.locator(".cm-content");
  await editor.fill("Submitted draft");
  await editor.press("ControlOrMeta+s");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Reopen note" }).click();
  await expect(page.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
  await expect(editor).toHaveText("Submitted draft");
  await editor.fill("Newer draft");
  await editor.press("ControlOrMeta+s");
  await expect(page.getByLabel("Save calls")).toHaveText("1");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(editor).toHaveText("Newer draft");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await editor.press("ControlOrMeta+s");
  await expect(page.getByLabel("Original snapshot")).toHaveText("Submitted draft");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(page.getByTitle("Unsaved changes")).toHaveCount(0);
});

test("save failure after close restores retryable draft", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("Recoverable draft");
  await editor.press("ControlOrMeta+s");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Reject save", exact: true }).click();
  await page.getByRole("button", { name: "Reopen note" }).click();
  await expect(editor).toHaveText("Recoverable draft");
  await expect(page.getByRole("button", { name: "Save (Cmd+S)", exact: true })).toBeEnabled();
  await editor.press("ControlOrMeta+s");
  await page.getByRole("button", { name: "Complete save", exact: true }).click();
  await expect(page.getByLabel("Persisted content")).toHaveText("Recoverable draft");
});

test("file mutation rejects closed drafts before starting native work", async ({ page }) => {
  await page.locator(".cm-content").fill("Hidden draft");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Begin file operation" }).click();
  await expect(page.getByLabel("File operation result")).toContainText(
    "Save changes in /fixture/note.md",
  );
  await expect(page.getByRole("button", { name: "Fail file operation" })).toBeDisabled();
  await page.getByRole("button", { name: "Reopen note" }).click();
  await expect(page.locator(".cm-content")).toHaveText("Hidden draft");
});

test("native operation locks editors across remounts and failure restores typing", async ({
  page,
}) => {
  const editor = page.locator(".cm-content");
  await page.getByRole("button", { name: "Begin file operation" }).click();
  await expect(page.getByLabel("File operation result")).toHaveText("Pending");
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await page.getByRole("button", { name: "Switch note" }).click();
  await expect(editor).toHaveText("# Other note");
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await page.getByRole("button", { name: "Fail file operation" }).click();
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await editor.fill("Draft after failure");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Switch note" }).click();
  await expect(editor).toHaveText("# Original note");
  await expect(editor).toHaveAttribute("contenteditable", "true");
});

test("preview shows unsaved text while preserving mounted CodeMirror view", async ({ page }) => {
  const editor = page.locator(".cm-content");
  const codeMirror = page.locator(".cm-editor");
  await editor.fill("# Unsaved preview\n\n## Current draft\n\nVisible immediately.");
  await codeMirror.evaluate((element) => element.setAttribute("data-view-token", "mounted"));

  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByLabel("Markdown preview")).toContainText("Unsaved preview");
  await expect(page.getByLabel("Markdown preview")).toContainText("Visible immediately.");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(codeMirror).toHaveAttribute("data-view-token", "mounted");
  await expect(editor).toContainText("Current draft");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(editor).toContainText("Current draft");
});

test("outline follows syntax headings and focuses selected source heading", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("# Alpha\n\n## Beta\n\n### Gamma");
  await page.getByRole("button", { name: "Toggle document outline" }).click();
  const outline = page.getByLabel("Document outline");
  await expect(outline.getByRole("button", { name: "Beta" })).toBeVisible();
  await expect(outline.getByRole("button", { name: "Gamma" })).toBeVisible();
  await outline.getByRole("button", { name: "Gamma" }).click();
  await expect(editor).toBeFocused();
});

test("formatting toolbar inserts Markdown source", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("A heading");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(editor).toContainText("A **heading**");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
});

test("attachment import inserts portable Markdown and preview loads no embedded resource", async ({
  page,
}) => {
  const editor = page.locator(".cm-content");
  await page.getByLabel("Choose attachment").setInputFiles({
    name: "diagram.png",
    mimeType: "image/png",
    buffer: Buffer.from([1, 2, 3]),
  });
  await expect(editor).toContainText("![diagram.png](attachments/diagram.png)");
  await expect(page.getByLabel("Attachment import result")).toHaveText("diagram.png:3");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Image preview disabled: diagram.png")).toBeVisible();
  await expect(page.locator(".markdown-preview img")).toHaveCount(0);
});

test("late attachment import after close never dispatches into a destroyed editor", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Delay attachment import" }).click();
  await page.getByLabel("Choose attachment").setInputFiles({
    name: "late.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("late attachment"),
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Complete attachment import" }).click();
  await page.getByRole("button", { name: "Reopen note" }).click();
  await expect(page.locator(".cm-content")).toHaveText("# Original note");
});

test("late attachment import does not edit a document that became locked", async ({ page }) => {
  await page.getByRole("button", { name: "Delay attachment import" }).click();
  await page.getByLabel("Choose attachment").setInputFiles({
    name: "locked.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("locked attachment"),
  });
  await page.getByRole("button", { name: "Begin file operation" }).click();
  const editor = page.locator(".cm-content");
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await page.getByRole("button", { name: "Complete attachment import" }).click();
  await expect(page.locator(".editor-message")).toHaveText(
    "Attachment imported, but this document became read-only before insertion.",
  );
  await expect(editor).toHaveText("# Original note");
  await page.getByRole("button", { name: "Fail file operation" }).click();
  await expect(editor).toHaveAttribute("contenteditable", "true");
});

test("outline converges to headings beyond the initial large-document parse", async ({ page }) => {
  const editor = page.locator(".cm-content");
  const paragraphs = Array.from({ length: 3000 }, (_, index) => `Paragraph ${index}.`).join("\n");
  await editor.fill(`# First heading\n\n${paragraphs}\n\n# Final heading`);
  await page.getByRole("button", { name: "Toggle document outline" }).click();
  await expect(
    page.getByLabel("Document outline").getByRole("button", { name: "Final heading" }),
  ).toBeVisible({ timeout: 10000 });
});

test("preview routes relative links through the Markdown callback", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("[Open next note](next.md#details)");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("link", { name: "Open next note" }).click();
  await expect(page.getByLabel("Opened Markdown link")).toHaveText("next.md#details");
});
