import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { buildKanbanBoard, compareKanbanTasks, relativeProjectPath } from "./model";

function task(overrides: Partial<Task> = {}): Task {
  return {
    line_number: 1,
    raw_markdown: "- [ ] Example +work",
    hash: "task",
    status: "todo",
    task_type: "task",
    description: "Example",
    project: "work",
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
    file_path: "/vault/tasks.md",
    parent_hash: null,
    ...overrides,
  };
}

describe("buildKanbanBoard", () => {
  it("scopes exact and descendant projects without prefix collisions", () => {
    const board = buildKanbanBoard({
      selectedProject: "work",
      tasks: [
        task({ hash: "direct" }),
        task({ hash: "child", line_number: 2, project: "work/client" }),
        task({ hash: "sibling-prefix", project: "workshop" }),
        task({ hash: "event", task_type: "event" }),
        task({ hash: "subtask", parent_hash: "direct" }),
      ],
    });

    expect(board.map((column) => column.status)).toEqual(["todo", "doing", "deferred"]);
    expect(board[0].groups.flatMap((group) => group.cards.map((card) => card.task.hash))).toEqual([
      "direct",
      "child",
    ]);
    expect(
      board[0].groups.flatMap((group) => group.cards.map((card) => card.relativeProject)),
    ).toEqual([null, "client"]);
  });

  it("adds requested closed columns in stable order", () => {
    const board = buildKanbanBoard({
      selectedProject: "work",
      tasks: [task({ status: "done" }), task({ status: "cancelled" })],
      visibleClosedStatuses: ["cancelled", "done"],
    });

    expect(board.map((column) => column.status)).toEqual([
      "todo",
      "doing",
      "deferred",
      "done",
      "cancelled",
    ]);
  });

  it("groups by primary context with context-free tasks first", () => {
    const board = buildKanbanBoard({
      selectedProject: "work",
      tasks: [
        task({ hash: "z", contexts: ["zulu", "ignored"], primary_context: "zulu" }),
        task({ hash: "none" }),
        task({ hash: "a", contexts: ["alpha"], primary_context: "alpha" }),
      ],
    });

    expect(board[0].groups.map((group) => group.context)).toEqual([null, "alpha", "zulu"]);
  });

  it("filters before removing empty groups", () => {
    const board = buildKanbanBoard({
      selectedProject: "work",
      searchQuery: "needle",
      tasks: [
        task({ hash: "match", description: "Needle task", primary_context: "desk" }),
        task({ hash: "miss", description: "Other task", primary_context: "phone" }),
      ],
    });

    expect(board[0].groups).toHaveLength(1);
    expect(board[0].groups[0].context).toBe("desk");
    expect(board[0].groups[0].cards[0].task.hash).toBe("match");
  });
});

describe("Kanban sorting and relative labels", () => {
  it("sorts by priority, due date, source path, line, then hash", () => {
    const tasks = [
      task({ hash: "unranked" }),
      task({ hash: "later", priority: 2, due_date: "2026-10-02" }),
      task({ hash: "sooner", priority: 2, due_date: "2026-10-01" }),
      task({ hash: "high", priority: 1 }),
    ];

    expect(tasks.sort(compareKanbanTasks).map((item) => item.hash)).toEqual([
      "high",
      "sooner",
      "later",
      "unranked",
    ]);
  });

  it("returns only descendant-relative project paths", () => {
    expect(relativeProjectPath("work", "work")).toBeNull();
    expect(relativeProjectPath("work/client/project", "work")).toBe("client/project");
    expect(relativeProjectPath("other", "work")).toBeNull();
  });
});
