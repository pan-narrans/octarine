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

describe("task status persistence", () => {
  it("keeps current tasks while saving and reconciles backend result", async () => {
    const original = task();
    const indexed = task({ status: "done", hash: "saved" });
    let finish: () => void = () => undefined;
    ipc.updateTaskStatus.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    ipc.getTasks.mockResolvedValue([indexed]);
    useTaskStore.setState({ tasks: [original], activeFilter: "+work" });

    const saving = useTaskStore
      .getState()
      .updateTaskStatus(original.file_path!, original.line_number, original.raw_markdown, "done");
    expect(useTaskStore.getState().loading).toBe(true);
    expect(useTaskStore.getState().tasks).toEqual([original]);
    expect(ipc.updateTaskStatus).toHaveBeenCalledWith(
      original.file_path,
      original.line_number,
      original.raw_markdown,
      "done",
    );
    finish();
    await saving;
    expect(ipc.getTasks).toHaveBeenCalledWith("+work");
    expect(useTaskStore.getState()).toMatchObject({
      tasks: [indexed],
      loading: false,
      error: null,
    });
  });

  it.each(["source_changed", "source_missing", "source_ambiguous"])(
    "%s refreshes authoritative tasks and keeps conflict visible",
    async (code) => {
      const original = task();
      const external = task({ hash: "external", description: "External edit" });
      useTaskStore.setState({ tasks: [original] });
      ipc.updateTaskStatus.mockRejectedValue({ code, message: "Refresh source." });
      ipc.getTasks.mockResolvedValue([external]);
      await useTaskStore
        .getState()
        .updateTaskStatus("/vault/work.md", 1, original.raw_markdown, "done");
      expect(useTaskStore.getState()).toMatchObject({
        tasks: [external],
        loading: false,
        error: "Refresh source.",
      });
    },
  );

  it("failed write retains tasks and clears loading without reporting success", async () => {
    const original = task();
    useTaskStore.setState({ tasks: [original] });
    ipc.updateTaskStatus.mockRejectedValue({ code: "operation_failed", message: "Write failed." });
    await useTaskStore
      .getState()
      .updateTaskStatus("/vault/work.md", 1, original.raw_markdown, "done");
    expect(ipc.getTasks).not.toHaveBeenCalled();
    expect(useTaskStore.getState()).toMatchObject({
      tasks: [original],
      loading: false,
      error: "Write failed.",
    });
  });

  it("failed refresh retains last known tasks and exposes refresh failure", async () => {
    const original = task();
    useTaskStore.setState({ tasks: [original] });
    ipc.getTasks.mockRejectedValue(new Error("Cache unavailable"));
    await useTaskStore.getState().fetchTasks();
    expect(useTaskStore.getState()).toMatchObject({
      tasks: [original],
      loading: false,
      error: "Cache unavailable",
    });
  });
});
