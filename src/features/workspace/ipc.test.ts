import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { writeFileContent } from "./ipc";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("guarded file persistence IPC", () => {
  it("sends exact original bytes including CRLF", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    await expect(writeFileContent("/vault/note.md", "Edited\n", "Original\r\n")).resolves.toBe(
      true,
    );
    expect(invoke).toHaveBeenCalledWith("write_file_content", {
      path: "/vault/note.md",
      content: "Edited\n",
      originalContent: "Original\r\n",
    });
  });
  it("uses explicit null for create-only scaffolding", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    await writeFileContent("/vault/journal.md", "# Journal", null);
    expect(invoke).toHaveBeenCalledWith("write_file_content", {
      path: "/vault/journal.md",
      content: "# Journal",
      originalContent: null,
    });
  });
  it("returns durable save with index failure separately from rejected save", async () => {
    vi.mocked(invoke).mockResolvedValue(false);
    await expect(writeFileContent("/vault/note.md", "Edit", "Original")).resolves.toBe(false);
    const conflict = { code: "source_changed", message: "File changed" };
    vi.mocked(invoke).mockRejectedValue(conflict);
    await expect(writeFileContent("/vault/note.md", "Edit", "Original")).rejects.toEqual(conflict);
  });
  it("rejects malformed acknowledgement", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await expect(writeFileContent("/vault/note.md", "Edit", "Original")).rejects.toThrow(
      "Invalid file save response.",
    );
  });
});
