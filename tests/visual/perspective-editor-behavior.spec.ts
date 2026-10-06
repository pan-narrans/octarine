import { expect, test } from "@playwright/test";

const settingsStory = (story: string) =>
  `/iframe.html?id=perspectives-settings-editor--${story}&viewMode=story`;
const editorStory = (story: string) =>
  `/iframe.html?id=perspectives-editor-behavior--${story}&viewMode=story`;
const runtimeStory = (story: string) =>
  `/iframe.html?id=perspectives-runtime-behavior--${story}&viewMode=story`;

function detail(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: "Edit Perspective" });
}

async function clickOption(
  page: import("@playwright/test").Page,
  dropdownName: string,
  optionName: string,
) {
  await detail(page).getByRole("button", { name: dropdownName }).click();
  await detail(page).getByRole("option", { name: optionName, exact: true }).click();
}

async function persistedConfig(page: import("@playwright/test").Page) {
  const text = await page.getByLabel("Persisted configuration").textContent();
  if (!text || text === "No configuration saved") {
    throw new Error("No Perspective configuration was persisted.");
  }
  return JSON.parse(text) as {
    version: number;
    perspectives: Array<{
      id: string;
      title: string;
      sidebar: Array<Record<string, unknown>>;
    }>;
  };
}

test("loading keeps editor actions disabled until configuration arrives", async ({ page }) => {
  await page.goto(editorStory("loading"));
  await expect(page.getByText("Loading Perspectives…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Perspective" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await page.getByRole("button", { name: "Complete configuration load" }).click();
  await expect(page.getByText("Loading Perspectives…", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Perspective" })).toBeEnabled();
});

test("creating Perspective saves semantic modules and omits unchanged built-in", async ({
  page,
}) => {
  await page.goto(editorStory("create-and-persist"));
  await page.getByRole("button", { name: "Create Perspective" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Writing");
  await expect(page.getByText("new-perspective", { exact: true })).toBeVisible();

  await detail(page).getByRole("button", { name: "Add module…" }).click();
  await detail(page).getByRole("option", { name: "File Tree", exact: true }).click();
  const root = detail(page).getByLabel("Workspace root");
  await root.click();
  for (const option of ["Vault root", "Journal root", "Projects root"]) {
    await expect(detail(page).getByRole("option", { name: option, exact: true })).toBeVisible();
  }
  await detail(page).getByRole("option", { name: "Journal root", exact: true }).click();

  await clickOption(page, "Collection behavior", "Journal root");
  await clickOption(page, "Collection behavior", "None");

  await detail(page).getByRole("button", { name: "Add module…" }).click();
  await detail(page).getByRole("option", { name: "Contexts", exact: true }).click();
  await detail(page).getByRole("button", { name: "Add module…" }).click();
  await expect(detail(page).getByRole("option", { name: "Contexts", exact: true })).toHaveCount(0);
  await expect(detail(page).getByRole("option", { name: "File Tree", exact: true })).toBeVisible();
  await detail(page).getByRole("button", { name: "Add module…" }).click();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const config = await persistedConfig(page);
  expect(config).toMatchObject({
    version: 1,
    perspectives: [
      {
        id: "new-perspective",
        title: "Writing",
        sidebar: [
          { id: "files", type: "file-tree", title: "Files", root: "journal" },
          { id: "contexts", type: "contexts" },
        ],
      },
    ],
  });
  expect(config.perspectives.map((perspective) => perspective.id)).not.toContain("default");
  expect(config.perspectives[0]?.sidebar[0]).not.toHaveProperty("collection");
});

test("editing configured Perspective persists new title with same ID", async ({ page }) => {
  await page.goto(editorStory("edit-and-persist"));
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Field notes");
  await expect(detail(page).getByText("Stable ID writing")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const config = await persistedConfig(page);
  expect(config.perspectives).toHaveLength(1);
  expect(config.perspectives[0]).toMatchObject({ id: "writing", title: "Field notes" });
});

test("clearing optional enum removes its persisted option", async ({ page }) => {
  await page.goto(editorStory("clear-optional-enum"));
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  await clickOption(page, "Collection behavior", "None");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const saved = await persistedConfig(page);
  expect(saved.perspectives[0]?.sidebar[0]).toMatchObject({ id: "journal-files", root: "journal" });
  expect(saved.perspectives[0]?.sidebar[0]).not.toHaveProperty("collection");
});

test("malformed file stays untouched until explicit recovery draft is saved", async ({ page }) => {
  await page.goto(editorStory("malformed-recovery"));
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await expect(page.getByLabel("Persisted configuration")).toHaveText("{ broken user config");

  await page.getByRole("button", { name: "Start from default" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  await expect(page.getByLabel("Persisted configuration")).toHaveText("{ broken user config");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect((await persistedConfig(page)).perspectives).toEqual([]);
});

test("read failure disables save and makes no persistence call", async ({ page }) => {
  await page.goto(editorStory("read-failure"));
  await expect(page.getByText("Could not load Perspectives", { exact: true })).toBeVisible();
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();
  await expect(page.getByLabel("Save calls")).toHaveText("0");
});

test("failed native save retains draft for retry and persists retry content", async ({ page }) => {
  await page.goto(editorStory("retryable-save"));
  await page.getByRole("button", { name: "Create Perspective" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Retryable notes");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Fixture save rejected");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Retryable notes");
  await expect(page.getByLabel("Persisted configuration")).toHaveText("No configuration saved");

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const config = await persistedConfig(page);
  expect(config.perspectives[0]).toMatchObject({ id: "new-perspective", title: "Retryable notes" });
});

test("pending save shows saving state and disables duplicate submit", async ({ page }) => {
  await page.goto(editorStory("deferred-save-after-unmount"));
  await page.getByRole("button", { name: "Create Perspective" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(page.getByLabel("Save calls")).toHaveText("1");
});

test("external change conflict preserves draft and blocks stale save", async ({ page }) => {
  await page.goto(editorStory("external-change-conflict"));
  await page.getByRole("button", { name: "Create Perspective" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Local draft");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("alert")).toContainText("changed outside Octarine");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Local draft");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("deferred native save still notifies parent after editor unmount", async ({ page }) => {
  await page.goto(editorStory("deferred-save-after-unmount"));
  await page.getByRole("button", { name: "Create Perspective" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await page.getByRole("button", { name: "Unmount editor" }).click();
  await expect(page.getByRole("heading", { name: "Perspectives", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Complete native save" }).click();
  await expect(page.getByLabel("Runtime refresh calls")).toHaveText("1");
  expect((await persistedConfig(page)).perspectives[0]?.id).toBe("new-perspective");
});

test("runtime reload warning keeps durable save and supports refresh retry", async ({ page }) => {
  await page.goto(settingsStory("runtime-reload-failure"));
  await expect(page.getByRole("alert")).toContainText("File saved");
  await expect(page.getByRole("alert")).toContainText("Runtime rejected the saved configuration");
  await page.getByRole("button", { name: "Retry refresh" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("stale workspace refresh cannot affect newly selected workspace", async ({ page }) => {
  await page.goto(runtimeStory("stale-workspace-refresh"));
  await expect(page.getByLabel("Active perspective")).toHaveText("Workspace A");
  await page.getByRole("button", { name: "Switch to workspace B" }).click();
  await expect(page.getByLabel("Runtime workspace")).toHaveText("workspace-b");
  await expect(page.getByLabel("Active perspective")).toHaveText("Workspace B");
  const readCalls = await page.getByLabel("Configuration read calls").textContent();

  await page.getByRole("button", { name: "Run saved workspace A refresh" }).click();
  await expect(page.getByLabel("Old refresh completed")).toHaveText("yes");
  await expect(page.getByLabel("Configuration refreshing")).toHaveText("no");
  await expect(page.getByLabel("Configuration read calls")).toHaveText(readCalls ?? "");
});

test("returning to loaded workspace clears loading after another workspace read is abandoned", async ({
  page,
}) => {
  await page.goto(runtimeStory("rapid-return-to-workspace"));
  await expect(page.getByLabel("Active perspective")).toHaveText("Workspace A");
  await page.getByRole("button", { name: "Switch to workspace B" }).click();
  await expect(page.getByLabel("Runtime workspace")).toHaveText("workspace-b");
  await expect(page.getByLabel("Runtime loading")).toHaveText("yes");

  await page.getByRole("button", { name: "Return to workspace A" }).click();
  await expect(page.getByLabel("Runtime workspace")).toHaveText("workspace-a");
  await expect(page.getByLabel("Active perspective")).toHaveText("Workspace A");
  await expect(page.getByLabel("Runtime loading")).toHaveText("no");
});

test("configuration refresh does not replace active selection after storage write failure", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const key = "octarine:selected-perspective:%2Fruntime-selection-test";
    localStorage.removeItem(key);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name.startsWith("octarine:selected-perspective:")) {
        throw new Error("Storage write blocked by fixture.");
      }
      original.call(this, name, value);
    };
  });
  await page.goto(runtimeStory("selection-survives-refresh-failure"));
  await expect(page.getByLabel("Active perspective title")).toHaveText("Workspace");
  await page.getByRole("button", { name: "Choose Writing" }).click();
  await expect(page.getByLabel("Active perspective", { exact: true })).toHaveText("writing");
  await expect(page.getByLabel("Runtime warnings")).toContainText(
    "Active Perspective could not be saved on this device.",
  );

  await page.getByRole("button", { name: "Refresh configuration" }).click();
  await expect(page.getByLabel("Configuration refreshing")).toHaveText("no");
  await expect(page.getByLabel("Active perspective title")).toHaveText("Writing");
});
