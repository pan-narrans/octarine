import { describe, expect, it } from "vitest";
import { captureContextForSection } from "./use-task-creation-controller";

describe("task creation capture context", () => {
  it.each([
    ["proj:work/octarine", { project: "work/octarine", contexts: [], tags: [] }],
    ["ctx:desk", { project: null, contexts: ["desk"], tags: [] }],
    ["tag:launch", { project: null, contexts: [], tags: ["launch"] }],
    ["all", { project: null, contexts: [], tags: [] }],
    ["todo", { project: null, contexts: [], tags: [] }],
    ["doing", { project: null, contexts: [], tags: [] }],
    ["events", { project: null, contexts: [], tags: [] }],
    ["view:focus", { project: null, contexts: [], tags: [] }],
  ])("maps %s", (section, expected) => {
    expect(captureContextForSection(section)).toEqual(expected);
  });
});
