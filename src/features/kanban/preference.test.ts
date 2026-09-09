import { describe, expect, it, vi } from "vitest";
import {
  parseProjectViewMode,
  PROJECT_VIEW_MODE_KEY,
  readProjectViewMode,
  writeProjectViewMode,
} from "./preference";

describe("project view preference", () => {
  it.each([
    [null, "board"],
    ["invalid", "board"],
    ["board", "board"],
    ["list", "list"],
  ])("parses %s as %s", (stored, expected) => {
    expect(parseProjectViewMode(stored)).toBe(expected);
  });

  it("falls back when storage cannot be read", () => {
    expect(
      readProjectViewMode({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBe("board");
  });

  it("writes one global preference key", () => {
    const setItem = vi.fn();
    writeProjectViewMode({ setItem }, "list");
    expect(setItem).toHaveBeenCalledWith(PROJECT_VIEW_MODE_KEY, "list");
  });
});
