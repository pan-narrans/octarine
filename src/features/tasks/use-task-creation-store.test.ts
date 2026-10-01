import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateTaskResult, TaskDraft } from "../../types";
import { useTaskStore } from "../../hooks/use-task-store";
import { createTask, previewTaskDraft, undoCreatedTask } from "./ipc";
import { useTaskCreationStore } from "./use-task-creation-store";

vi.mock("./ipc", async (importOriginal) => {
  const original = await importOriginal<typeof import("./ipc")>();
  return {
    ...original,
    createTask: vi.fn(),
    previewTaskDraft: vi.fn(),
    undoCreatedTask: vi.fn(),
  };
});

const draft: TaskDraft = {
  title: "Created",
  notes: "",
  status: "todo",
  priority: null,
  dueDate: null,
  duration: null,
  recurrence: null,
  project: null,
  contexts: [],
  tags: [],
  subtasks: [],
  rawMarkdown: "- [ ] Created",
};

const result: CreateTaskResult = {
  task: {
    line_number: 4,
    raw_markdown: "- [ ] Created",
    hash: "created-hash",
    status: "todo",
    task_type: "task",
    description: "Created",
    project: null,
    due_date: null,
    s_start: null,
    duration_secs: null,
    recurring: null,
    when_done: null,
    priority: null,
    tags: [],
    contexts: [],
    primary_context: null,
    parse_errors: null,
    file_path: "/vault/inbox.md",
    parent_hash: null,
  },
  destinationPath: "/vault/inbox.md",
  warning: null,
  undoReceipt: {
    filePath: "/vault/inbox.md",
    lineNumber: 4,
    rawMarkdown: "- [ ] Created",
    sourceFingerprint: "fingerprint",
  },
};

describe("task creation store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskCreationStore.getState().reset();
    useTaskStore.setState({ tasks: [], loading: false, error: null });
  });

  it("keeps only latest preview response", async () => {
    let resolveFirst: ((value: never) => void) | undefined;
    vi.mocked(previewTaskDraft)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({
        draft: { ...draft, title: "Second" },
        taskType: "task",
        destinationPath: "/vault/inbox.md",
        inheritedProject: null,
      });

    const first = useTaskCreationStore.getState().previewCompact("First", {
      project: null,
      contexts: [],
      tags: [],
    });
    await useTaskCreationStore.getState().previewCompact("Second", {
      project: null,
      contexts: [],
      tags: [],
    });
    resolveFirst?.({
      draft,
      taskType: "task",
      destinationPath: "/vault/old.md",
      inheritedProject: null,
    } as never);
    await first;

    expect(useTaskCreationStore.getState().preview?.draft.title).toBe("Second");
  });

  it("deduplicates pending creation and reconciles returned task once", async () => {
    let resolveCreate: ((value: CreateTaskResult) => void) | undefined;
    vi.mocked(createTask).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const first = useTaskCreationStore.getState().createDraft("operation", draft);
    const second = useTaskCreationStore.getState().createDraft("operation", draft);
    expect(createTask).toHaveBeenCalledTimes(1);
    resolveCreate?.(result);
    await Promise.all([first, second]);

    expect(useTaskStore.getState().tasks).toEqual([result.task]);
    expect(useTaskCreationStore.getState().phase).toBe("created");
  });

  it("undoes receipt and refreshes tasks", async () => {
    vi.mocked(createTask).mockResolvedValue(result);
    vi.mocked(undoCreatedTask).mockResolvedValue();
    const fetchTasks = vi.fn().mockResolvedValue(undefined);
    useTaskStore.setState({ fetchTasks });
    await useTaskCreationStore.getState().createDraft("operation", draft);

    await expect(useTaskCreationStore.getState().undoLastCreation()).resolves.toBe(true);

    expect(undoCreatedTask).toHaveBeenCalledWith(result.undoReceipt);
    expect(fetchTasks).toHaveBeenCalledOnce();
    expect(useTaskCreationStore.getState().phase).toBe("idle");
  });
});
