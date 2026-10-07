import { expect, test } from "@playwright/test";

const appUrl = "http://127.0.0.1:1420/?visual=perspectives";

function navigation(page: import("@playwright/test").Page) {
  return page.getByRole("complementary", { name: "Octarine navigation" });
}

async function openPerspectivesSettings(page: import("@playwright/test").Page) {
  await navigation(page).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Perspectives" }).click();
}

async function switchWithShortcut(
  page: import("@playwright/test").Page,
  direction: "Left" | "Right",
) {
  await page.locator(".main-header h1").click();
  await page.keyboard.press(`Meta+Alt+Arrow${direction}`);
}

test("built-in modules render, then switcher and shortcut reach Perspectives with or without control", async ({
  page,
}) => {
  await page.goto(appUrl);

  const sidebar = navigation(page);
  for (const title of [
    "Smart Views",
    "Journals",
    "Notes",
    "Custom Query Dashboards",
    "Projects",
    "Contexts",
    "Tags",
  ]) {
    await expect(sidebar.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(sidebar.getByRole("heading", { name: "Perspectives", exact: true })).toHaveCount(0);

  await switchWithShortcut(page, "Right");
  await expect(sidebar.getByRole("heading", { name: "Perspectives", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Writing", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.reload();
  await expect(sidebar.getByRole("button", { name: "Writing", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await sidebar.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(sidebar.getByRole("heading", { name: "Perspectives", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("heading", { name: "Notes", exact: true })).toBeVisible();

  await switchWithShortcut(page, "Left");
  await expect(sidebar.getByRole("button", { name: "Writing", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("custom query uses shared task filtering and keeps filter on task refresh", async ({
  page,
}) => {
  await page.goto(appUrl);
  await switchWithShortcut(page, "Right");

  const sidebar = navigation(page);
  await sidebar.getByText("Active work", { exact: true }).click();
  await expect(page.locator(".main-header h1")).toHaveText("Query: Active work");
  await expect(
    page.getByText("Audit the calendar at compact widths", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Task 1", { exact: true })).toHaveCount(0);

  await page
    .getByRole("button", { name: "Change status for Audit the calendar at compact widths" })
    .click();
  await expect(page.getByText("Audit the calendar at compact widths", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".main-header h1")).toHaveText("Query: Active work");

  await switchWithShortcut(page, "Left");
  await navigation(page).getByText("All Tasks", { exact: true }).click();
  await expect(page.getByText("Task 1", { exact: true })).toBeVisible();
});

test("unsaved note buffer survives switcher changing active Perspective", async ({ page }) => {
  await page.goto(appUrl);
  await switchWithShortcut(page, "Right");

  const sidebar = navigation(page);
  const notesHeading = sidebar.getByRole("heading", { name: "Notes", exact: true });
  await notesHeading.locator("..").getByText("Expand", { exact: true }).click();
  const notes = sidebar.locator(".sidebar-section").filter({ hasText: "inbox.md" });
  await notes.getByText("inbox.md", { exact: true }).click();

  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("# Inbox");
  await editor.fill("# Unsaved app draft\n\nKeep this text while switching.");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();

  await sidebar.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(sidebar.getByRole("heading", { name: "Perspectives", exact: true })).toHaveCount(0);
  await expect(editor).toContainText("Keep this text while switching.");
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();
});

test("mobile navigation exposes Workspace footer and closes on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 840 });
  await page.goto(appUrl);

  const sidebar = navigation(page);
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(sidebar).toBeVisible();

  await sidebar.locator(".sidebar-scroll-content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(sidebar.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Task settings", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Perspectives", exact: true })).toHaveCount(0);
  await expect(sidebar.getByText("Active Vault Path", { exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(sidebar).toBeHidden();
  await expect(page.getByRole("tab", { name: "Task settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Perspectives" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Task creation", exact: true })).toBeVisible();
});

test("opening sidebar note from Settings exits Settings and shows editor", async ({ page }) => {
  await page.goto(appUrl);
  const sidebar = navigation(page);
  await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Task creation", exact: true })).toBeVisible();

  const notesHeading = sidebar.getByRole("heading", { name: "Notes", exact: true });
  await notesHeading.locator("..").getByText("Expand", { exact: true }).click();
  const notes = sidebar.locator(".sidebar-section").filter({ hasText: "inbox.md" });
  await notes.getByText("inbox.md", { exact: true }).click();

  await expect(page.getByRole("heading", { name: "Plaintext Note Editor" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("# Inbox");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toHaveCount(0);
});

test("opening Today's Entry from Settings exits Settings and shows editor", async ({ page }) => {
  await page.goto(appUrl);
  const sidebar = navigation(page);
  await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Task creation", exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "Write Today's Entry", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Plaintext Note Editor" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("Journal");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toHaveCount(0);
});

for (const { platform, shortcut } of [
  { platform: "MacIntel", shortcut: "Meta+," },
  { platform: "Linux x86_64", shortcut: "Control+," },
]) {
  test(`${shortcut} opens Settings from note editor and editable field`, async ({ page }) => {
    await page.addInitScript((platformName) => {
      Object.defineProperty(window.navigator, "platform", {
        configurable: true,
        value: platformName,
      });
    }, platform);
    await page.goto(appUrl);
    const sidebar = navigation(page);
    const notesHeading = sidebar.getByRole("heading", { name: "Notes", exact: true });
    await notesHeading.locator("..").getByText("Expand", { exact: true }).click();
    const notes = sidebar.locator(".sidebar-section").filter({ hasText: "inbox.md" });
    await notes.getByText("inbox.md", { exact: true }).click();

    const editor = page.locator(".cm-content");
    await expect(editor).toBeFocused();
    await page.keyboard.press(shortcut);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Task creation", exact: true })).toBeVisible();

    const inboxFile = page.getByRole("textbox", { name: "Inbox file", exact: true });
    await inboxFile.fill("draft-inbox.md");
    await page.keyboard.press(shortcut);
    await expect(page.getByRole("tab", { name: "Task settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(inboxFile).toHaveValue("draft-inbox.md");
  });
}

test("Settings menu creates, activates, and reloads saved configuration without switcher", async ({
  page,
}) => {
  await page.goto(appUrl);
  const sidebar = navigation(page);
  await openPerspectivesSettings(page);
  const initialEditor = page.locator(".perspective-settings");
  await initialEditor
    .getByRole("region", { name: "Perspective list" })
    .getByRole("button", { name: "Writing", exact: true })
    .click();
  await initialEditor
    .getByRole("region", { name: "Edit Perspective" })
    .getByRole("button", { name: "Use", exact: true })
    .click();
  await sidebar.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(sidebar.locator('[aria-label="Perspective switcher"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "Task settings" }).click();
  await expect(page.getByRole("heading", { name: "Task creation", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Perspectives" }).click();

  const editor = page.locator(".perspective-settings");
  const detail = editor.getByRole("region", { name: "Edit Perspective" });
  await editor.getByRole("button", { name: "Create Perspective" }).click();
  await editor.getByRole("textbox", { name: "Name" }).fill("Research");
  await page.getByRole("tab", { name: "Task settings" }).click();
  await page.getByRole("tab", { name: "Perspectives" }).click();
  await expect(editor.getByRole("textbox", { name: "Name" })).toHaveValue("Research");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByText("Saved", { exact: true })).toBeVisible();
  await expect(detail.getByText("Stable ID new-perspective")).toBeVisible();
  await detail.getByRole("button", { name: "Use", exact: true }).click();
  await expect(detail.getByText("Active", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Task settings" }).click();
  await page.getByRole("tab", { name: "Perspectives" }).click();
  const reloadedEditor = page.locator(".perspective-settings");
  await reloadedEditor.getByRole("button", { name: "Research", exact: true }).click();
  const reloadedDetail = reloadedEditor.getByRole("region", { name: "Edit Perspective" });
  await expect(reloadedDetail.getByText("Stable ID new-perspective")).toBeVisible();
  await expect(reloadedDetail.getByText("Active", { exact: true })).toBeVisible();
});

test("pending save refreshes configuration for workspace selected before write completes", async ({
  page,
}) => {
  await page.goto(`${appUrl}&defer-perspective-save=1`);
  const sidebar = navigation(page);
  await openPerspectivesSettings(page);

  const editor = page.locator(".perspective-settings");
  const detail = editor.getByRole("region", { name: "Edit Perspective" });
  await editor.getByRole("button", { name: "Create Perspective" }).click();
  await editor.getByRole("textbox", { name: "Name" }).fill("Research");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByRole("button", { name: "Saving…" })).toBeDisabled();

  await sidebar.getByRole("button", { name: "Edit vault path" }).click();
  const footer = sidebar.locator(".sidebar-footer");
  await footer.locator(".sidebar-vault-input").fill("/visual/perspectives/vault-two");
  await footer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sidebar.getByText("/visual/perspectives/vault-two", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("Loading workspace...", { exact: true })).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new Event("perspective-fixture-release-save")));
  await expect(editor.getByText("Saved", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Use", exact: true }).click();
  await expect(detail.getByText("Active", { exact: true })).toBeVisible();
});

test("saved query edits update title and filter, and removal clears sidebar entry", async ({
  page,
}) => {
  await page.goto(appUrl);
  const sidebar = navigation(page);
  await openPerspectivesSettings(page);

  const editor = page.locator(".perspective-settings");
  const list = editor.getByRole("region", { name: "Perspective list" });
  await list.getByRole("button", { name: "Writing", exact: true }).click();
  const detail = editor.getByRole("region", { name: "Edit Perspective" });
  const queryModule = detail
    .locator(".perspective-editor-module")
    .filter({ hasText: "Active work" });
  await queryModule.getByRole("textbox", { name: "Filter" }).fill("status = todo");
  await queryModule.getByRole("textbox", { name: "Title" }).fill("Inbox triage");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByText("Saved", { exact: true })).toBeVisible();

  await detail.getByRole("button", { name: "Use", exact: true }).click();
  await sidebar.getByText("Inbox triage", { exact: true }).click();
  await expect(page.locator(".main-header h1")).toHaveText("Query: Inbox triage");
  await expect(page.getByText("Task 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Audit the calendar at compact widths", { exact: true })).toHaveCount(
    0,
  );

  await openPerspectivesSettings(page);
  const editAgain = page.locator(".perspective-settings");
  const writingDetail = editAgain.getByRole("region", { name: "Edit Perspective" });
  await editAgain
    .getByRole("region", { name: "Perspective list" })
    .getByRole("button", {
      name: "Writing",
      exact: true,
    })
    .click();
  await writingDetail.getByRole("button", { name: "Remove Inbox triage" }).click();
  await editAgain.getByRole("button", { name: "Save changes" }).click();
  await expect(editAgain.getByText("Saved", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("Inbox triage", { exact: true })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "Workspace", exact: true }).click();
  await sidebar.getByText("All Tasks", { exact: true }).click();
  await expect(page.getByText("Task 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Audit the calendar at compact widths", { exact: true }),
  ).toBeVisible();
});

test("removing active query during pending save falls back to all tasks after reload", async ({
  page,
}) => {
  await page.goto(`${appUrl}&defer-perspective-save=1`);
  const sidebar = navigation(page);
  await openPerspectivesSettings(page);

  const editor = page.locator(".perspective-settings");
  const detail = editor.getByRole("region", { name: "Edit Perspective" });
  await editor
    .getByRole("region", { name: "Perspective list" })
    .getByRole("button", { name: "Writing", exact: true })
    .click();
  await detail.getByRole("button", { name: "Use", exact: true }).click();
  await sidebar.getByText("Active work", { exact: true }).click();
  await expect(page.locator(".main-header h1")).toHaveText("Query: Active work");

  await openPerspectivesSettings(page);
  const editAgain = page.locator(".perspective-settings");
  await editAgain
    .getByRole("region", { name: "Perspective list" })
    .getByRole("button", { name: "Writing", exact: true })
    .click();
  const writingDetail = editAgain.getByRole("region", { name: "Edit Perspective" });
  await writingDetail.getByRole("button", { name: "Remove Active work" }).click();
  await editAgain.getByRole("button", { name: "Save changes" }).click();
  await expect(editAgain.getByRole("button", { name: "Saving…" })).toBeDisabled();

  await sidebar.getByText("Active work", { exact: true }).click();
  await expect(page.locator(".main-header h1")).toHaveText("Query: Active work");
  await page.evaluate(() => window.dispatchEvent(new Event("perspective-fixture-release-save")));

  await expect(page.locator(".main-header h1")).toHaveText("Inbox Dashboard");
  await expect(page.getByText("Task 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Audit the calendar at compact widths", { exact: true }),
  ).toBeVisible();
});

test("legacy custom view title with colon keeps title-based query semantics", async ({ page }) => {
  await page.goto(appUrl);
  const sidebar = navigation(page);
  await sidebar.getByText("work:today", { exact: true }).click();
  await expect(page.locator(".main-header h1")).toHaveText("Query: work:today");
  await expect(
    page.getByText("Audit the calendar at compact widths", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Task 1", { exact: true })).toHaveCount(0);
});
