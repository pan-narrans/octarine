import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../types";

const ipc = vi.hoisted(() => ({
  getTasks: vi.fn(),
  getCustomViews: vi.fn(),
  moveTask: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

vi.mock("../features/tasks/ipc", async (importOriginal) => {
  const original = await importOriginal<typeof import("../features/tasks/ipc")>();
  return { ...original, ...ipc };
});

import { useTaskStore } from "./use-task-store";

function task(overrides: Partial<Task> = {}): Task {
  return {
    line_number: 1,
    raw_markdown: "- [ ] Move me +work @ana @call",
    hash: "move-me",
    status: "todo",
    task_type: "task",
    description: "Move me",
    project: "work",
    due_date: null,
    s_start: null,
    duration_secs: null,
    recurring: null,
    when_done: null,
    priority: null,
    tags: [],
    contexts: ["ana", "call"],
    primary_context: "ana",
    parse_errors: null,
    file_path: "/vault/work.md",
    parent_hash: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useTaskStore.setState({
    tasks: [],
    customViews: [],
    loading: false,
    error: null,
    activeFilter: "",
    pendingTaskMoves: [],
  });
});

describe("optimistic Kanban moves", () => {
  it("moves immediately and reconciles indexed state", async () => {
    const original = task();
    const indexed = task({
      status: "doing",
      contexts: ["bea", "call"],
      primary_context: "bea",
      raw_markdown: "- [/] Move me +work @bea @call",
    });
    let finishMove: () => void = () => undefined;
    ipc.moveTask.mockReturnValue(
      new Promise<void>((resolve) => {
        finishMove = resolve;
      }),
    );
    ipc.getTasks.mockResolvedValue([indexed]);
    useTaskStore.setState({ tasks: [original] });

    const moving = useTaskStore
      .getState()
      .moveTask(original, { newStatus: "doing", newPrimaryContext: "bea" });

    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      status: "doing",
      contexts: ["bea", "call"],
      primary_context: "bea",
    });
    expect(useTaskStore.getState().pendingTaskMoves).toEqual([original.hash]);

    finishMove();
    await moving;
    expect(useTaskStore.getState().tasks).toEqual([indexed]);
    expect(useTaskStore.getState().pendingTaskMoves).toEqual([]);
  });

  it("rolls back only failed task and exposes structured error", async () => {
    const original = task();
    const other = task({ hash: "other", description: "Other" });
    ipc.moveTask.mockRejectedValue({ code: "operation_failed", message: "Move failed." });
    useTaskStore.setState({ tasks: [original, other] });

    await useTaskStore.getState().moveTask(original, { newStatus: "deferred" });

    expect(useTaskStore.getState().tasks).toEqual([original, other]);
    expect(useTaskStore.getState().error).toBe("Move failed.");
    expect(useTaskStore.getState().pendingTaskMoves).toEqual([]);
  });

  it("refreshes source state after conflict", async () => {
    const original = task();
    const external = task({ description: "Externally edited" });
    ipc.moveTask.mockRejectedValue({ code: "source_changed", message: "Task changed." });
    ipc.getTasks.mockResolvedValue([external]);
    useTaskStore.setState({ tasks: [original] });

    await useTaskStore.getState().moveTask(original, { newStatus: "doing" });

    expect(ipc.getTasks).toHaveBeenCalledOnce();
    expect(useTaskStore.getState().tasks).toEqual([external]);
    expect(useTaskStore.getState().error).toBe("Task changed.");
  });
});
