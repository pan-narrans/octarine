import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Task } from "../../types";
import { TaskCard } from "./TaskCard";

const task: Task = {
  line_number: 1,
  raw_markdown:
    "- [ ] (B) Audit the calendar at compact widths due:2026-08-28 +octarine/ui @laptop #responsive\n  Preserve the month hierarchy while reducing crowding.",
  hash: "storybook-task-card",
  status: "todo",
  task_type: "task",
  description: "Audit the calendar at compact widths",
  project: "octarine/ui",
  due_date: "2026-08-28",
  s_start: null,
  duration_secs: null,
  recurring: null,
  when_done: null,
  priority: 2,
  tags: ["responsive"],
  contexts: ["laptop"],
  parse_errors: null,
  file_path: "/example/tasks.md",
  parent_hash: null,
};

const subtask: Task = {
  ...task,
  line_number: 2,
  raw_markdown: "  - [ ] Verify the compact calendar hierarchy",
  hash: "storybook-task-card-subtask",
  description: "Verify the compact calendar hierarchy",
  project: null,
  due_date: null,
  priority: null,
  tags: [],
  contexts: [],
  parent_hash: task.hash,
};

const meta = {
  title: "Tasks/TaskCard",
  component: TaskCard,
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: "100vh",
          padding: "40px",
          background: "var(--bg-space)",
        }}
      >
        <div className="task-list condensed">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    task,
    tasks: [task, subtask],
    onOpen: () => undefined,
    onStatusChange: () => undefined,
    showScheduleMetadata: false,
  },
} satisfies Meta<typeof TaskCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Focused: Story = {
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>(
      '[role="button"][aria-label^="Edit task:"]',
    );
    card?.focus();
  },
};

export const Done: Story = {
  args: {
    task: {
      ...task,
      status: "done",
      due_date: null,
      raw_markdown:
        "- [x] (B) Audit the calendar at compact widths +octarine/ui @laptop #responsive done:2026-08-24",
    },
    tasks: [],
  },
};

export const Cancelled: Story = {
  args: {
    task: {
      ...task,
      status: "cancelled",
      raw_markdown:
        "- [-] (B) Audit the calendar at compact widths +octarine/ui @laptop #responsive",
    },
    tasks: [],
  },
};

export const Notes: Story = {
  args: {
    task: {
      ...task,
      raw_markdown: `${task.raw_markdown.split("\n")[0]}
  Preserve the month hierarchy while reducing crowding.
  Confirm keyboard navigation after resizing.`,
    },
    tasks: [],
  },
};

export const NestedSubtasks: Story = {
  args: {
    task: { ...task, raw_markdown: task.raw_markdown.split("\n")[0] },
    tasks: [
      task,
      subtask,
      {
        ...subtask,
        line_number: 3,
        hash: "storybook-task-card-subtask-done",
        raw_markdown: "  - [x] Confirm keyboard navigation",
        description: "Confirm keyboard navigation",
        status: "done",
      },
    ],
  },
};

export const DenseMetadata: Story = {
  args: {
    task: {
      ...task,
      s_start: "2026-08-28T14:00",
      duration_secs: 7200,
      contexts: ["laptop", "office"],
      tags: ["responsive", "design-system"],
    },
    tasks: [],
    showScheduleMetadata: true,
  },
};

export const Narrow: Story = {
  args: {
    task: { ...task, raw_markdown: task.raw_markdown.split("\n")[0] },
    tasks: [],
  },
  globals: { viewport: { value: "octarineMobile", isRotated: false } },
};

function InteractionHarness() {
  const [currentTask, setCurrentTask] = useState({
    ...task,
    raw_markdown: task.raw_markdown.split("\n")[0],
  });
  const [lastAction, setLastAction] = useState("No action");

  return (
    <>
      <TaskCard
        task={currentTask}
        tasks={[currentTask]}
        onOpen={(selectedTask) => setLastAction(`Opened ${selectedTask.hash}`)}
        onStatusChange={(selectedTask, status) => {
          setCurrentTask((previous) =>
            previous.hash === selectedTask.hash ? { ...previous, status } : previous,
          );
          setLastAction(`Status changed to ${status}`);
        }}
        showScheduleMetadata={false}
      />
      <output data-testid="last-action" style={{ display: "block", marginTop: "16px" }}>
        {lastAction}
      </output>
    </>
  );
}

export const Interactive: Story = {
  render: () => <InteractionHarness />,
};
