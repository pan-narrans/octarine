import { describe, expect, it, vi } from "vitest";
import {
  parseShowInactiveProjects,
  projectVisibilityKey,
  readShowInactiveProjects,
  writeShowInactiveProjects,
} from "./project-visibility-preference";

describe("inactive project visibility preference", () => {
  it.each([
    [null, false],
    ["", false],
    ["false", false],
    ["invalid", false],
    ["true", true],
  ])("parses %s as %s", (stored, expected) => {
    expect(parseShowInactiveProjects(stored)).toBe(expected);
  });

  it("qualifies key by vault identity", () => {
    expect(projectVisibilityKey("/vaults/work notes")).toBe(
      "octarine.sidebar.show-inactive-projects:%2Fvaults%2Fwork%20notes",
    );
  });

  it("reads independent vault values", () => {
    const values = new Map([
      [projectVisibilityKey("/vault/a"), "true"],
      [projectVisibilityKey("/vault/b"), "false"],
    ]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };

    expect(readShowInactiveProjects(storage, "/vault/a")).toBe(true);
    expect(readShowInactiveProjects(storage, "/vault/b")).toBe(false);
    expect(readShowInactiveProjects(storage, "/vault/missing")).toBe(false);
  });

  it("falls back when storage cannot be read", () => {
    expect(
      readShowInactiveProjects(
        {
          getItem: () => {
            throw new Error("denied");
          },
        },
        "/vault",
      ),
    ).toBe(false);
  });

  it("writes vault-qualified value", () => {
    const setItem = vi.fn();
    writeShowInactiveProjects({ setItem }, "/vault/a", true);
    expect(setItem).toHaveBeenCalledWith(projectVisibilityKey("/vault/a"), "true");
  });

  it("swallows storage write failures", () => {
    expect(() =>
      writeShowInactiveProjects(
        {
          setItem: () => {
            throw new Error("denied");
          },
        },
        "/vault",
        true,
      ),
    ).not.toThrow();
  });
});
