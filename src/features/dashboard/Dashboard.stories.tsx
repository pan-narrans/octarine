import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Task } from "../../types";
import { Dashboard } from "./Dashboard";

const today = new Date();
const date = (offset: number) => {
  const value = new Date(today);
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate(),
  ).padStart(2, "0")}`;
};

const baseTask: Task = {
  line_number: 1,
  raw_markdown: "- [ ] (A) Review dashboard hierarchy +octarine/ui @desk #design due:2026-08-28",
  hash: "dashboard-task",
  status: "todo",
  task_type: "task",
  description: "Review dashboard hierarchy",
  project: "octarine/ui",
  due_date: "2026-08-28",
  s_start: null,
  duration_secs: null,
  recurring: null,
  when_done: null,
  priority: 1,
  tags: ["design"],
  contexts: ["desk"],
  primary_context: "desk",
  parse_errors: null,
  file_path: "/example/tasks.md",
  parent_hash: null,
};

const tasks: Task[] = [
  baseTask,
  {
    ...baseTask,
    hash: "dashboard-task-2",
    line_number: 2,
    description: "Ship the navigation review",
    priority: 2,
  },
  {
    ...baseTask,
    hash: "dashboard-event-today",
    line_number: 3,
    task_type: "event",
    description: "Design review",
    s_start: `${date(0)} 10:00`,
    duration_secs: 3600,
    priority: null,
  },
  {
    ...baseTask,
    hash: "dashboard-event-upcoming",
    line_number: 4,
    task_type: "event",
    description: "Planning session",
    s_start: `${date(2)} 14:30`,
    duration_secs: 1800,
    priority: null,
  },
];

const meta = {
  title: "Dashboard/Dashboard",
  component: Dashboard,
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: "100vh",
          padding: "clamp(16px, 4vw, 48px)",
          background: "var(--bg-space)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    tasks,
    projects: ["octarine/ui"],
    contexts: ["desk"],
    journalContent: "# Daily note\n\nCapture the outcome of today's review.",
    journalPath: "/example/journal/today.md",
    journalLoading: false,
    onSaveJournal: async () => undefined,
    onOpenTask: () => undefined,
    onStatusChange: () => undefined,
  },
} satisfies Meta<typeof Dashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tablet: Story = {
  globals: { viewport: { value: "octarineTablet", isRotated: false } },
};

export const Mobile: Story = {
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};

export const Narrow: Story = {
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};

export const Quiet: Story = {
  args: { tasks: [], journalLoading: true, journalContent: null },
};
