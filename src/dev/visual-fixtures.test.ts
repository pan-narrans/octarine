import { describe, expect, it } from "vitest";
import { taskStatusFromMarkdown } from "./visual-fixtures";

describe("visual fixture task updates", () => {
  it.each([
    ["- [ ] Plan release", "todo"],
    ["- [/] Plan release", "doing"],
    ["- [>] Plan release", "deferred"],
    ["- [x] Plan release", "done"],
    ["- [X] Plan release", "done"],
    ["- [-] Plan release", "cancelled"],
  ] as const)("derives %s as %s", (markdown, status) => {
    expect(taskStatusFromMarkdown(markdown)).toBe(status);
  });
});
