import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { applyKanbanMove, isKanbanMoveNoop } from "./move";

const task = {
  hash: "task",
  status: "todo",
  primary_context: "ana",
  contexts: ["ana", "call"],
} as Task;

describe("Kanban move reduction", () => {
  it("preserves contexts for status-only moves", () => {
    const moved = applyKanbanMove(task, { newStatus: "doing" });
    expect(moved.status).toBe("doing");
    expect(moved.contexts).toEqual(["ana", "call"]);
    expect(moved.primary_context).toBe("ana");
  });

  it("replaces only primary context", () => {
    const moved = applyKanbanMove(task, {
      newStatus: "deferred",
      newPrimaryContext: "bea",
    });
    expect(moved.contexts).toEqual(["bea", "call"]);
    expect(moved.primary_context).toBe("bea");
  });

  it("inserts primary context when absent", () => {
    const moved = applyKanbanMove(
      { ...task, contexts: [], primary_context: null },
      { newStatus: "doing", newPrimaryContext: "ana" },
    );
    expect(moved.contexts).toEqual(["ana"]);
  });

  it("detects status and named-context no-ops", () => {
    expect(isKanbanMoveNoop(task, { newStatus: "todo" })).toBe(true);
    expect(isKanbanMoveNoop(task, { newStatus: "todo", newPrimaryContext: "ana" })).toBe(true);
    expect(isKanbanMoveNoop(task, { newStatus: "todo", newPrimaryContext: "bea" })).toBe(false);
  });
});
