import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { importAttachment, resolveMarkdownLink, writeFileContent } from "./ipc";

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

describe("Markdown workspace IPC", () => {
  it("resolves Markdown file links through native path validation", async () => {
    vi.mocked(invoke).mockResolvedValue({ path: "/vault/notes/next.md", fragment: "details" });
    await expect(
      resolveMarkdownLink("/vault/notes/current.md", "next.md#details"),
    ).resolves.toEqual({ path: "/vault/notes/next.md", fragment: "details" });
    expect(invoke).toHaveBeenCalledWith("resolve_markdown_link", {
      documentPath: "/vault/notes/current.md",
      target: "next.md#details",
    });
  });

  it("rejects malformed resolved link DTOs", async () => {
    vi.mocked(invoke).mockResolvedValue({ path: 42, fragment: null });
    await expect(resolveMarkdownLink("/vault/note.md", "next.md")).rejects.toThrow(
      "Invalid Markdown link response.",
    );
  });

  it("sends attachment bytes to native import and returns portable path", async () => {
    vi.mocked(invoke).mockResolvedValue({
      fileName: "diagram-2.png",
      relativePath: "attachments/diagram-2.png",
    });
    await expect(
      importAttachment("/vault/notes/current.md", "diagram.png", new Uint8Array([0, 128, 255])),
    ).resolves.toEqual({
      fileName: "diagram-2.png",
      relativePath: "attachments/diagram-2.png",
    });
    expect(invoke).toHaveBeenCalledWith("import_attachment", {
      documentPath: "/vault/notes/current.md",
      fileName: "diagram.png",
      bytes: [0, 128, 255],
    });
  });

  it("rejects malformed attachment import DTOs", async () => {
    vi.mocked(invoke).mockResolvedValue({ fileName: "image.png" });
    await expect(importAttachment("/vault/note.md", "image.png", new Uint8Array())).rejects.toThrow(
      "Invalid attachment import response.",
    );
  });
});
