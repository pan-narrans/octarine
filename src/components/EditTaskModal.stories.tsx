import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditTaskModal } from "./EditTaskModal";
import type { Task } from "../types";

const task: Task = {
  line_number: 1,
  raw_markdown: `- [/] (A) Plan the Storybook pilot due:2026-08-29 dur:2h recurring:"every weekday" +Octarine @desk #design
  - [ ] Capture the existing task-modal visual rules
    - [ ] Include the default and markdown source states
  - [ ] Review the implemented modal in Storybook`,
  hash: "storybook-task-modal",
  status: "doing",
  task_type: "task",
  description: "Prepare the first Storybook-led visual review pilot.",
  project: "Octarine",
  due_date: "2026-08-29",
  s_start: null,
  duration_secs: 7200,
  recurring: "every weekday",
  when_done: null,
  priority: 1,
  tags: ["design"],
  contexts: ["desk"],
  primary_context: "desk",
  parse_errors: null,
  file_path: "/example/tasks.md",
  parent_hash: null,
};

const meta = {
  title: "Tasks/EditTaskModal",
  component: EditTaskModal,
  args: {
    task,
    onClose: () => undefined,
    onSave: async () => undefined,
    onDelete: async () => undefined,
  },
} satisfies Meta<typeof EditTaskModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyTask: Story = {
  args: {
    task: {
      ...task,
      raw_markdown: "- [ ] Untitled task",
      description: "",
      project: null,
      due_date: null,
      duration_secs: null,
      recurring: null,
      priority: null,
      tags: [],
      contexts: [],
      primary_context: null,
    },

    initialShowMarkdown: false,
  },
};

export const MarkdownOpen: Story = {
  args: { initialShowMarkdown: true },
};

export const NestedSubtaskSelected: Story = {
  args: { initialSelectedTask: 1 },
};

export const Saving: Story = {
  args: { initialSaving: true },
};

export const Tablet: Story = {
  tags: ["visual"],
  globals: { viewport: { value: "octarineTablet", isRotated: false } },
};

export const Mobile: Story = {
  tags: ["visual"],
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};
