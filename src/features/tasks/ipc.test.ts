import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/tauri";
import {
  createTask,
  isCreateTaskResult,
  isPreparedProjectMerge,
  isProjectMergePlan,
  listProjectMergeRecovery,
  openProjectMergeRecovery,
  isTaskDraft,
  moveTaskProject,
  parseCreateTaskError,
  parseMoveTaskProjectError,
  parseProjectRenameError,
  parseProjectMergeError,
  preflightProjectMerge,
  preflightProjectRename,
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

  it("validates project move results and structured recovery errors", async () => {
    const task = {
      line_number: 1,
      raw_markdown: "- [ ] Task +new",
      hash: "moved-hash",
      status: "todo",
      task_type: "task",
      description: "Task",
      project: "new",
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
      file_path: "/vault/projects/new.md",
      parent_hash: null,
    };
    vi.mocked(invoke).mockResolvedValue({
      task,
      sourcePath: "/vault/inbox.md",
      destinationPath: "/vault/projects/new.md",
      warning: null,
    });

    await expect(
      moveTaskProject("/vault/inbox.md", 1, "- [ ] Task", "- [ ] Task +new"),
    ).resolves.toEqual(expect.objectContaining({ task }));
    expect(
      parseMoveTaskProjectError({
        code: "rollback_failed",
        message: "Recovery needed",
        recoveryRequired: true,
      }),
    ).toEqual({
      code: "rollback_failed",
      message: "Recovery needed",
      recoveryRequired: true,
    });
    expect(
      parseMoveTaskProjectError({
        code: "rollback_failed",
        message: "Missing recovery flag",
      }),
    ).toBeNull();
  });

  it("rejects malformed project move response", async () => {
    vi.mocked(invoke).mockResolvedValue({
      task: {},
      sourcePath: "/vault/inbox.md",
      destinationPath: "/vault/projects/new.md",
      warning: null,
    });
    await expect(
      moveTaskProject("/vault/inbox.md", 1, "- [ ] Task", "- [ ] Task +new"),
    ).rejects.toThrow("Invalid project move response.");
  });

  it("validates project rename plans and structured recovery errors", async () => {
    const plan = {
      planToken: "plan-token",
      sourceProject: "work",
      destinationProject: "job",
      caseOnly: false,
      rewrites: [],
      moves: [],
      indexUpdates: [],
      collisions: [],
      impact: {
        rewrittenFiles: 2,
        rewrittenTokens: 3,
        filesystemMoves: 1,
        descendantProjects: 1,
      },
      warnings: ["Markdown links are not updated."],
    };
    vi.mocked(invoke).mockResolvedValue(plan);

    await expect(preflightProjectRename("work", "job")).resolves.toEqual(plan);
    expect(
      parseProjectRenameError({
        code: "partial_failure",
        message: "Recovery needed",
        recovery: {
          completedOperations: ["Rewrite a.md"],
          pendingOperations: ["Move work.md"],
          inspectPaths: ["a.md", "projects/work.md"],
          guidance: "Inspect listed paths.",
        },
      }),
    ).toEqual(expect.objectContaining({ code: "partial_failure" }));
  });

  it("rejects malformed project rename plans and recovery errors", async () => {
    vi.mocked(invoke).mockResolvedValue({ planToken: "incomplete" });
    await expect(preflightProjectRename("work", "job")).rejects.toThrow(
      "Invalid project rename plan response.",
    );
    expect(
      parseProjectRenameError({
        code: "partial_failure",
        message: "Missing recovery fields",
        recovery: {},
      }),
    ).toBeNull();
    expect(parseProjectRenameError({ code: "unknown", message: "No" })).toBeNull();
  });

  it("validates project merge plans and structured recovery errors", async () => {
    const plan = {
      planToken: "merge-plan",
      operationId: "0123456789abcdef01234567",
      sourceProject: "old",
      destinationProject: "new",
      projectFolder: "projects",
      rewrites: [
        {
          path: "notes/tasks.md",
          destinationPath: "notes/tasks.md",
          sourceFingerprint: "source-hash",
          replacementCount: 1,
        },
      ],
      moves: [],
      conflicts: [],
      autoResolutions: [],
      collapsedDescendants: ["old/api"],
      impact: {
        rewrittenFiles: 1,
        rewrittenTokens: 1,
        filesystemMoves: 0,
        conflicts: 0,
        autoResolved: 0,
        collapsedDescendants: 1,
      },
      warnings: ["Links stay unchanged."],
    };
    vi.mocked(invoke).mockResolvedValue(plan);

    await expect(preflightProjectMerge("old", "new")).resolves.toEqual(plan);
    expect(isProjectMergePlan(plan)).toBe(true);
    expect(
      parseProjectMergeError({
        code: "partial_failure",
        message: "Stopped safely.",
        paths: [],
        recovery: {
          operationId: plan.operationId,
          recoveryPath: `.octarine/recovery/${plan.operationId}`,
          completedOperations: ["Install notes/tasks.md"],
          pendingOperations: ["Recover source projects/old.md"],
          inspectPaths: ["notes/tasks.md"],
          guidance: "Inspect recovery.",
        },
      }),
    ).toEqual(expect.objectContaining({ code: "partial_failure" }));
  });

  it("rejects malformed merge preparation, recovery, and errors", async () => {
    expect(isPreparedProjectMerge({ preparedToken: "incomplete" })).toBe(false);
    expect(parseProjectMergeError({ code: "unknown", message: "No", paths: [] })).toBeNull();
    expect(
      parseProjectMergeError({
        code: "partial_failure",
        message: "Missing report fields",
        paths: [],
        recovery: {},
      }),
    ).toBeNull();

    vi.mocked(invoke).mockResolvedValue([{ operationId: 1 }]);
    await expect(listProjectMergeRecovery()).rejects.toThrow(
      "Invalid project merge recovery response.",
    );
  });

  it("opens validated native merge recovery by operation ID", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await openProjectMergeRecovery("0123456789abcdef01234567");

    expect(invoke).toHaveBeenCalledWith("open_project_merge_recovery", {
      operationId: "0123456789abcdef01234567",
    });
  });
});
