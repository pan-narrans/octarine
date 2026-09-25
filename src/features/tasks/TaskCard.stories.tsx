import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
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
  primary_context: "laptop",
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
  primary_context: null,
  parent_hash: task.hash,
};

type TaskCardStoryArgs = ComponentProps<typeof TaskCard> & {
  taskStatus: Task["status"];
};

const taskStatusMarkers: Record<Task["status"], string> = {
  todo: " ",
  doing: "/",
  done: "x",
  deferred: ">",
  cancelled: "-",
};

function withTaskStatus(storyTask: Task, status: Task["status"]): Task {
  return {
    ...storyTask,
    status,
    raw_markdown: storyTask.raw_markdown.replace(
      /^(\s*[-*+]\s+)\[[ xX/>-]\]/,
      `$1[${taskStatusMarkers[status]}]`,
    ),
  };
}

const meta = {
  title: "Tasks/TaskCard",
  component: TaskCard,
  render: ({ taskStatus, task: storyTask, ...args }) => (
    <TaskCard {...args} task={withTaskStatus(storyTask, taskStatus)} />
  ),
  argTypes: {
    taskStatus: {
      control: "select",
      options: ["todo", "doing", "done", "deferred", "cancelled"],
    },
  },
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
    taskStatus: "todo",
    tasks: [task, subtask],
    onOpen: () => undefined,
    onStatusChange: () => undefined,
    showScheduleMetadata: false,
  },
} satisfies Meta<TaskCardStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Focused: Story = {
  tags: ["visual"],
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>(
      '[role="button"][aria-label^="Edit task:"]',
    );
    card?.focus();
  },
};

export const Done: Story = {
  args: {
    taskStatus: "done",
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

export const Deferred: Story = {
  args: {
    taskStatus: "deferred",
    task: {
      ...task,
      status: "deferred",
      raw_markdown:
        "- [>] (B) Audit the calendar at compact widths +octarine/ui @laptop #responsive",
    },
    tasks: [],
  },
};

export const Cancelled: Story = {
  args: {
    taskStatus: "cancelled",
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
  tags: ["visual"],
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
