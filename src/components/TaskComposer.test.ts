import { describe, expect, it } from "vitest";
import type { TaskDraft } from "../types";
import { inheritDraftProject } from "./task-composer-model";

function draft(title: string, subtasks: TaskDraft[] = []): TaskDraft {
  return {
    title,
    notes: "",
    status: "todo",
    priority: null,
    dueDate: null,
    duration: null,
    recurrence: null,
    project: "old/project",
    contexts: [],
    tags: [],
    subtasks,
    rawMarkdown: `- [ ] ${title}`,
  };
}

describe("TaskComposer project inheritance", () => {
  it("propagates changed and removed root project through complete subtree", () => {
    const original = draft("root", [draft("child", [draft("grandchild")])]);
    const renamed = inheritDraftProject(original, "new/project");

    expect(renamed.project).toBe("new/project");
    expect(renamed.subtasks[0].project).toBe("new/project");
    expect(renamed.subtasks[0].subtasks[0].project).toBe("new/project");
    expect(inheritDraftProject(renamed, null).subtasks[0].project).toBeNull();
  });
});
