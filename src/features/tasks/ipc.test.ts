import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/tauri";
import {
  createTask,
  isCreateTaskResult,
  isTaskDraft,
  parseCreateTaskError,
  previewTaskDraft,
} from "./ipc";
import type { TaskDraft } from "../../types";

vi.mock("@tauri-apps/api/tauri", () => ({ invoke: vi.fn() }));

const draft: TaskDraft = {
  title: "Task",
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
  rawMarkdown: "- [ ] Task",
};

describe("task creation IPC", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("narrows valid preview payload", async () => {
    vi.mocked(invoke).mockResolvedValue({
      draft,
      taskType: "task",
      destinationPath: "/vault/inbox.md",
      inheritedProject: null,
    });

    await expect(
      previewTaskDraft("Task", { project: null, contexts: [], tags: [] }),
    ).resolves.toEqual(expect.objectContaining({ destinationPath: "/vault/inbox.md" }));
  });

  it("rejects malformed preview payload", async () => {
    vi.mocked(invoke).mockResolvedValue({ draft: { title: 1 } });
    await expect(
      previewTaskDraft("Task", { project: null, contexts: [], tags: [] }),
    ).rejects.toThrow("Invalid task preview response.");
  });

  it("validates create results before returning them", async () => {
    const result = {
      task: {
        line_number: 1,
        raw_markdown: "- [ ] Task",
        hash: "hash",
        status: "todo",
        task_type: "task",
        description: "Task",
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
        lineNumber: 1,
        rawMarkdown: "- [ ] Task",
        sourceFingerprint: "fingerprint",
      },
    };
    vi.mocked(invoke).mockResolvedValue(result);

    await expect(createTask("operation", draft)).resolves.toEqual(result);
    expect(isCreateTaskResult(result)).toBe(true);
  });

  it("rejects malformed draft and result shapes", async () => {
    expect(isTaskDraft({ ...draft, subtasks: [{ title: 1 }] })).toBe(false);
    vi.mocked(invoke).mockResolvedValue({ destinationPath: "/vault/inbox.md" });
    await expect(createTask("operation", draft)).rejects.toThrow("Invalid task creation response.");
  });

  it("parses only known structured errors", () => {
    expect(parseCreateTaskError({ code: "destination_conflict", message: "Changed" })).toEqual({
      code: "destination_conflict",
      message: "Changed",
    });
    expect(parseCreateTaskError({ code: "unknown", message: "No" })).toBeNull();
  });
});
