import { useCallback, useMemo, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { PerspectiveEditorIo } from "./use-perspective-editor";
import { PerspectiveSettings } from "./PerspectiveSettings";
import { BUILT_IN_PERSPECTIVE } from "./default";
import type { PerspectiveDefinition } from "./model";

const configuredPerspectives: PerspectiveDefinition[] = [
  {
    id: "writing",
    title: "Writing",
    sidebar: [
      {
        id: "journal-files",
        type: "file-tree",
        title: "Journals",
        root: "journal",
        collection: "journal",
      },
      { id: "notes", type: "file-tree", title: "Notes", root: "vault" },
      { id: "tags", type: "tags" },
    ],
  },
  {
    id: "planning",
    title: "Planning",
    sidebar: [
      { id: "switcher", type: "perspective-switcher" },
      {
        id: "today-tasks",
        type: "custom-query",
        title: "Today's tasks",
        filter: "due = today AND status != done",
      },
      { id: "project-tree", type: "project-tree" },
    ],
  },
];

const editingPerspectives: PerspectiveDefinition[] = [
  {
    ...BUILT_IN_PERSPECTIVE,
    sidebar: [
      ...BUILT_IN_PERSPECTIVE.sidebar.map((instance) => ({ ...instance })),
      {
        id: "today-tasks",
        type: "custom-query",
        title: "Today's tasks",
        filter: "due = today AND status != done",
      },
    ],
  },
  ...configuredPerspectives,
];

function configText(perspectives: PerspectiveDefinition[]): string {
  return JSON.stringify({ version: 1, perspectives }, null, 2);
}

function reviewIo(rawText: string | null): PerspectiveEditorIo {
  return {
    load: async () => rawText,
    save: async () => true,
  };
}

const builtInIo = reviewIo(null);
const configuredIo = reviewIo(configText(configuredPerspectives));
const editingIo = reviewIo(configText(editingPerspectives));
const savingIo: PerspectiveEditorIo = {
  load: async () => configText(configuredPerspectives),
  save: () => new Promise<boolean>(() => undefined),
};
const failedSaveIo: PerspectiveEditorIo = {
  load: async () => configText(configuredPerspectives),
  save: async () => {
    throw new Error("Configuration directory is read-only.");
  },
};
const conflictIo: PerspectiveEditorIo = {
  load: async () => configText(configuredPerspectives),
  save: async () => false,
};
const malformedIo: PerspectiveEditorIo = {
  load: async () => "{ broken user config",
  save: async () => true,
};
const failedLoadSave = fn(async () => false);
const failedLoadIo: PerspectiveEditorIo = {
  load: async () => {
    throw new Error("Permission denied.");
  },
  save: failedLoadSave,
};

function RuntimeReloadFailureHarness() {
  const refreshAttempts = useRef(0);
  const io = useMemo<PerspectiveEditorIo>(
    () => ({ load: async () => null, save: async () => true }),
    [],
  );
  const onSaved = useCallback(async () => {
    if (refreshAttempts.current++ === 0) {
      throw new Error("Runtime rejected the saved configuration.");
    }
  }, []);

  return <PerspectiveSettings io={io} onSaved={onSaved} />;
}

const meta = {
  title: "Perspectives/Settings editor",
  component: PerspectiveSettings,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PerspectiveSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuiltIn: Story = {
  render: () => <PerspectiveSettings io={builtInIo} activePerspectiveId="default" />,
};

export const Configured: Story = {
  render: () => <PerspectiveSettings io={configuredIo} activePerspectiveId="writing" />,
};

export const EditingModules: Story = {
  render: () => <PerspectiveSettings io={editingIo} activePerspectiveId="default" />,
};

export const NewPerspective: Story = {
  render: () => <PerspectiveSettings io={builtInIo} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const createButton = await canvas.findByRole("button", { name: "Create Perspective" });
    await expect(createButton).toBeEnabled();
    await userEvent.click(createButton);
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveValue("New perspective");
    await expect(canvas.getByRole("button", { name: "Copy Perspective" })).toBeEnabled();
  },
};

export const MalformedRecovery: Story = {
  render: () => <PerspectiveSettings io={malformedIo} />,
};

export const LoadFailure: Story = {
  render: () => <PerspectiveSettings io={failedLoadIo} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Could not load Perspectives");
    const saveButton = canvas.getByRole("button", { name: "Save changes" });
    await expect(saveButton).toBeDisabled();
    await userEvent.click(saveButton);
    await expect(failedLoadSave).not.toHaveBeenCalled();
  },
};

export const Saving: Story = {
  render: () => <PerspectiveSettings io={savingIo} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const createButton = await canvas.findByRole("button", { name: "Create Perspective" });
    await expect(createButton).toBeEnabled();
    await userEvent.click(createButton);
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(canvas.getByRole("button", { name: "Saving…" })).toBeDisabled();
  },
};

export const SaveError: Story = {
  render: () => <PerspectiveSettings io={failedSaveIo} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const createButton = await canvas.findByRole("button", { name: "Create Perspective" });
    await expect(createButton).toBeEnabled();
    await userEvent.click(createButton);
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(/was not saved/i);
  },
};

export const ExternalChangeConflict: Story = {
  render: () => <PerspectiveSettings io={conflictIo} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const createButton = await canvas.findByRole("button", { name: "Create Perspective" });
    await expect(createButton).toBeEnabled();
    await userEvent.click(createButton);
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(/changed outside Octarine/i);
  },
};

export const RuntimeReloadFailure: Story = {
  render: () => <RuntimeReloadFailureHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Create Perspective" }));
    await userEvent.clear(canvas.getByRole("textbox", { name: "Name" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Reviewable warning");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("File saved");
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Runtime rejected the saved configuration.",
    );
  },
};

export const NarrowEditor: Story = {
  render: () => <PerspectiveSettings io={configuredIo} />,
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
  tags: ["visual"],
};
