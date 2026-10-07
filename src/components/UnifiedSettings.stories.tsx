import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { TaskCreationSettingsValue } from "./TaskCreationSettings";
import { TaskCreationSettings } from "./TaskCreationSettings";
import { ApplicationUpdateSettings } from "./ApplicationUpdateSettings";
import { ProjectMergeRecoveryList } from "./ProjectMergeWorkflow";
import type { ProjectMergeRecoveryBundle } from "../types";
import type { AvailableUpdate } from "../generated/ipc/AvailableUpdate";
import type { UpdateRuntimeInfo } from "../generated/ipc/UpdateRuntimeInfo";
import { UnifiedSettings } from "./UnifiedSettings";
import type { UnifiedSettingsSection } from "./UnifiedSettings";
import { PerspectiveSettings } from "../features/perspectives/PerspectiveSettings";
import type { PerspectiveDefinition } from "../features/perspectives/model";
import type { PerspectiveEditorIo } from "../features/perspectives/use-perspective-editor";

const taskSettings: TaskCreationSettingsValue = {
  defaultDestination: "inbox",
  inboxFile: "inbox.md",
  journalFolder: "journals",
  dailyFilenamePattern: "YYYY-MM-DD.md",
  projectFolder: "projects",
  destinations: {
    inbox: {
      template: "# Inbox\n\n## Tasks\n",
      insertionMode: "heading",
      insertionTarget: "## Tasks",
    },
    dailyNote: {
      template: "# {{date}}\n\n## Tasks\n",
      insertionMode: "heading",
      insertionTarget: "## Tasks",
    },
    project: {
      template: "# {{project_name}}\n\n## Tasks\n",
      insertionMode: "heading",
      insertionTarget: "## Tasks",
    },
  },
};

const perspectives: PerspectiveDefinition[] = [
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

const updateRuntime: UpdateRuntimeInfo = {
  currentVersion: "0.2.0-beta.3",
  channel: "beta",
  channelMutable: true,
  distribution: "direct",
  installStrategy: "self_update",
  checkConfigured: true,
  installationSupported: true,
};

const availableUpdate: AvailableUpdate = {
  currentVersion: updateRuntime.currentVersion,
  version: "0.2.0-beta.4",
  notes: "Perspective navigation and task capture improvements.",
  publishedAt: "2026-10-01T12:00:00Z",
  channel: "beta",
  downloadPageUrl: "https://example.invalid/octarine/releases",
};

const recoveryBundles: ProjectMergeRecoveryBundle[] = [
  {
    operationId: "0123456789abcdef01234567",
    recoveryPath: ".octarine/recovery/0123456789abcdef01234567",
    createdAt: "2026-09-11T08:30:00Z",
    completedAt: "2026-09-11T08:31:18Z",
    expiresAt: "2026-10-11T08:31:18Z",
    sourceProject: "product/launch",
    destinationProject: "product/platform",
    status: "successful",
    sizeBytes: 184_320,
    completedOperations: 14,
    pendingOperations: 0,
  },
];

const perspectiveIo: PerspectiveEditorIo = {
  load: async () => JSON.stringify({ version: 1, perspectives }, null, 2),
  save: async () => true,
};

function TaskSettingsPanel() {
  const [value, setValue] = useState(taskSettings);
  const [saved, setSaved] = useState(false);

  return (
    <div className="task-settings-app-surface">
      <ApplicationUpdateSettings
        runtime={updateRuntime}
        available={availableUpdate}
        checking={false}
        installing={false}
        savingChannel={false}
        error={null}
        onChannelChange={() => undefined}
        onCheck={() => undefined}
        onInstall={() => undefined}
      />
      <TaskCreationSettings
        value={value}
        saved={saved}
        onChange={(nextValue) => {
          setValue(nextValue);
          setSaved(false);
        }}
        onSave={() => setSaved(true)}
      />
      <div className="task-settings-recovery-section">
        <ProjectMergeRecoveryList
          bundles={recoveryBundles}
          onOpen={() => undefined}
          onDelete={() => undefined}
        />
      </div>
    </div>
  );
}

function SettingsStory({ initialSection }: { initialSection: UnifiedSettingsSection }) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const panels = {
    "task-settings": <TaskSettingsPanel />,
    perspectives: <PerspectiveSettings io={perspectiveIo} activePerspectiveId="writing" />,
  };

  return (
    <div className="unified-settings-story">
      <UnifiedSettings
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        panels={panels}
      />
    </div>
  );
}

const meta = {
  title: "Settings/Unified settings",
  component: SettingsStory,
  parameters: { layout: "fullscreen" },
  args: { initialSection: "task-settings" },
} satisfies Meta<typeof SettingsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TaskSettings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const taskTab = canvas.getByRole("tab", { name: "Task settings" });
    const perspectivesTab = canvas.getByRole("tab", { name: "Perspectives" });

    await expect(taskTab).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("heading", { name: "Task creation" })).toBeVisible();
    await userEvent.click(perspectivesTab);
    await expect(perspectivesTab).toHaveAttribute("aria-selected", "true");
    await expect(await canvas.findByRole("heading", { name: "Your Perspectives" })).toBeVisible();
    const perspectiveName = canvas.getByRole("textbox", { name: "Name" });
    await userEvent.clear(perspectiveName);
    await userEvent.type(perspectiveName, "Writing draft");
    await userEvent.click(taskTab);
    await expect(taskTab).toHaveAttribute("aria-selected", "true");
    await userEvent.click(perspectivesTab);
    await expect(perspectiveName).toHaveValue("Writing draft");
    await userEvent.keyboard("{ArrowLeft}");
    await expect(taskTab).toHaveAttribute("aria-selected", "true");
  },
};

export const Perspectives: Story = {
  args: { initialSection: "perspectives" },
};

export const Narrow: Story = {
  tags: ["visual"],
  args: { initialSection: "task-settings" },
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};
