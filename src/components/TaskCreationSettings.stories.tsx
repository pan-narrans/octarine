import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TaskCreationSettingsProps, TaskCreationSettingsValue } from "./TaskCreationSettings";
import { TaskCreationSettings } from "./TaskCreationSettings";

const settings: TaskCreationSettingsValue = {
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
      template: "# {{project_name}}\n\nProject: +{{project}}\n\n## Tasks\n",
      insertionMode: "heading",
      insertionTarget: "## Tasks",
    },
  },
};

function ReviewHarness(props: TaskCreationSettingsProps) {
  const [value, setValue] = useState(props.value);
  const [saved, setSaved] = useState(props.saved);

  useEffect(() => setValue(props.value), [props.value]);
  useEffect(() => setSaved(props.saved), [props.saved]);

  return (
    <main className="task-settings-review-surface">
      <TaskCreationSettings
        {...props}
        value={value}
        saved={saved}
        onChange={(nextValue) => {
          setValue(nextValue);
          setSaved(false);
        }}
        onSave={() => setSaved(true)}
      />
    </main>
  );
}

type SaveState = "idle" | "saving" | "saved";
type TaskCreationSettingsStoryArgs = TaskCreationSettingsProps & { saveState: SaveState };

const meta = {
  title: "Settings/TaskCreationSettings",
  component: TaskCreationSettings,
  render: ({ saveState, ...args }) => (
    <ReviewHarness {...args} saving={saveState === "saving"} saved={saveState === "saved"} />
  ),
  argTypes: {
    saveState: {
      control: "select",
      options: ["idle", "saving", "saved"],
    },
  },
  args: {
    value: settings,
    saveState: "idle",
    onChange: () => undefined,
    onSave: () => undefined,
  },
} satisfies Meta<TaskCreationSettingsStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Invalid: Story = {
  args: {
    value: {
      ...settings,
      inboxFile: "/Users/me/Desktop/inbox.md",
      projectFolder: "private/projects",
      destinations: {
        ...settings.destinations,
        inbox: { ...settings.destinations.inbox, template: "# {{project}}" },
      },
    },
    errors: {
      inboxFile: "Inbox file must be relative to vault.",
      projectFolder: "Project folder is ignored by .octarineignore.",
      "inbox.template": "Inbox template cannot use {{project}}.",
    },
  },
};

export const MigrationRequired: Story = {
  args: { migrationSource: "~/octarine_journal" },
};

export const Saving: Story = {
  args: { saveState: "saving" },
};

export const Saved: Story = {
  args: { saveState: "saved" },
};

export const ProjectTemplate: Story = {
  args: { initialDestination: "project" },
};

export const MarkerInsertion: Story = {
  args: {
    initialDestination: "project",
    value: {
      ...settings,
      destinations: {
        ...settings.destinations,
        project: {
          ...settings.destinations.project,
          insertionMode: "marker",
          insertionTarget: "<!-- octarine:tasks -->",
        },
      },
    },
  },
};

export const EndOfFileInsertion: Story = {
  args: {
    initialDestination: "dailyNote",
    value: {
      ...settings,
      destinations: {
        ...settings.destinations,
        dailyNote: {
          ...settings.destinations.dailyNote,
          insertionMode: "eof",
          insertionTarget: "",
        },
      },
    },
  },
};

export const Narrow: Story = {
  tags: ["visual"],
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};
