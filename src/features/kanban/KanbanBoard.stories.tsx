import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Task } from "../../types";
import { KanbanBoard } from "./KanbanBoard";
import { applyKanbanMove, type KanbanMoveIntent } from "./move";

function task(overrides: Partial<Task> & Pick<Task, "hash" | "description">): Task {
  const contexts = overrides.contexts ?? [];
  return {
    line_number: 1,
    raw_markdown: `- [ ] ${overrides.description} +octarine`,
    status: "todo",
    task_type: "task",
    project: "octarine",
    due_date: null,
    s_start: null,
    duration_secs: null,
    recurring: null,
    when_done: null,
    priority: null,
    tags: [],
    contexts,
    primary_context: overrides.primary_context ?? contexts[0] ?? null,
    parse_errors: null,
    file_path: "/example/tasks.md",
    parent_hash: null,
    ...overrides,
  };
}

const tasks: Task[] = [
  task({
    hash: "migration-window",
    description: "Confirm migration window",
    priority: 1,
    contexts: ["call"],
    tags: ["migration"],
  }),
  task({
    hash: "interaction-spec",
    description: "Write Kanban interaction spec",
    line_number: 2,
    project: "octarine/design",
    contexts: [],
    tags: ["design"],
  }),
  task({
    hash: "parser-review",
    description: "Review parser edge cases",
    line_number: 3,
    status: "doing",
    contexts: ["ana", "legacy"],
    tags: ["parser"],
  }),
  task({
    hash: "ship-parser-fix",
    description: "Ship parser fix",
    line_number: 4,
    status: "doing",
    due_date: "2026-09-08",
    raw_markdown: "- [/] Ship parser fix due:2026-09-08 +octarine @call #parser",
    contexts: ["call"],
    tags: ["parser"],
  }),
  task({
    hash: "keyboard-prototype",
    description: "Prototype keyboard card movement",
    line_number: 5,
    status: "doing",
    contexts: [],
    tags: ["accessibility"],
  }),
  task({
    hash: "mobile-navigation",
    description: "Revisit mobile navigation",
    line_number: 6,
    status: "deferred",
    contexts: ["research"],
    tags: ["mobile"],
  }),
  task({
    hash: "completed-docs",
    description: "Document task syntax",
    line_number: 7,
    status: "done",
    due_date: "2026-09-03",
    raw_markdown: "- [x] Document task syntax due:2026-09-03 done:2026-09-05 +octarine #docs",
    tags: ["docs"],
  }),
  task({
    hash: "cancelled-spike",
    description: "Try alternate parser",
    line_number: 8,
    status: "cancelled",
    contexts: ["computer"],
    tags: ["parser"],
  }),
];

const meta = {
  title: "Kanban/KanbanBoard",
  component: KanbanBoard,
  decorators: [
    (Story) => (
      <main className="kanban-story-surface">
        <Story />
      </main>
    ),
  ],
  args: {
    tasks,
    selectedProject: "octarine",
    onOpenTask: () => undefined,
    onStatusChange: () => undefined,
    onMoveTask: () => undefined,
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof KanbanBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: { visibleClosedStatuses: ["done"] },
};

export const ClosedColumns: Story = {
  args: { visibleClosedStatuses: ["done", "cancelled"] },
};

export const Empty: Story = {
  args: { tasks: [] },
};

export const FilteredEmpty: Story = {
  args: { searchQuery: "does-not-exist" },
};

export const ErrorRollback: Story = {
  args: { errorMessage: "Task changed outside Octarine. Board state was refreshed." },
};

export const DragPreview: Story = {
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('.kanban-card[draggable="true"]');
    const anaGroup = canvasElement.querySelector<HTMLElement>('[aria-label="Context ana"]');
    if (!card || !anaGroup) return;
    const dataTransfer = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    anaGroup.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer }));
  },
};

function InteractiveBoard() {
  const [interactiveTasks, setInteractiveTasks] = useState(tasks);
  const moveTask = (selectedTask: Task, intent: KanbanMoveIntent) => {
    setInteractiveTasks((current) =>
      current.map((candidate) =>
        candidate.hash === selectedTask.hash ? applyKanbanMove(candidate, intent) : candidate,
      ),
    );
  };
  return (
    <KanbanBoard
      tasks={interactiveTasks}
      selectedProject="octarine"
      onOpenTask={() => undefined}
      onStatusChange={() => undefined}
      onMoveTask={moveTask}
    />
  );
}

export const Interactive: Story = {
  render: () => <InteractiveBoard />,
};

export const LargeGroup: Story = {
  args: {
    tasks: Array.from({ length: 55 }, (_, index) =>
      task({
        hash: `large-${index}`,
        description: `Project task ${index + 1}`,
        line_number: index + 1,
        contexts: ["computer"],
        raw_markdown:
          index % 5 === 0
            ? `- [ ] Project task ${index + 1} +octarine @computer\n  - Longer supporting note for dynamic card measurement.`
            : `- [ ] Project task ${index + 1} +octarine @computer`,
      }),
    ),
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "octarineNarrow", isRotated: false } },
};
