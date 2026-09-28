import { expect, it, vi } from "vitest";
import { EditorSessions } from "./editor-sessions";

it("restores dirty buffers and exact CRLF preconditions after navigation and external edits", async () => {
  const sessions = new EditorSessions();
  const note = sessions.open("/vault/note.md", "Original\r\n");
  const close = note.subscribe(() => undefined);
  note.edit("Local\n");
  close();
  const restored = sessions.open("/vault/note.md", "External\r\n");
  restored.refresh("External\r\n");
  expect(restored.content).toBe("Local\n");
  const write = vi.fn().mockRejectedValue(new Error("File changed"));
  await expect(restored.save(write)).rejects.toThrow("File changed");
  expect(write).toHaveBeenCalledWith("Local\n", "Original\r\n");
  expect(restored.dirty).toBe(true);
  expect(sessions.hasUnsavedChanges).toBe(true);
});

it("deduplicates pending writes across remounts and preserves newer edits", async () => {
  const sessions = new EditorSessions();
  const note = sessions.open("/vault/note.md", "Original");
  const close = note.subscribe(() => undefined);
  note.edit("First edit");
  let complete!: () => void;
  const write = vi.fn(() => new Promise<void>((resolve) => (complete = resolve)));
  const pending = note.save(write);
  close();
  const restored = sessions.open("/vault/note.md", "Original");
  restored.edit("Newer edit");
  await restored.save(write);
  expect(write).toHaveBeenCalledOnce();
  complete();
  await pending;
  expect(restored.content).toBe("Newer edit");
  expect(restored.originalContent).toBe("First edit");
  expect(restored.dirty).toBe(true);
  expect(restored.saved).toBe(false);
  const retry = vi.fn().mockResolvedValue(undefined);
  await restored.save(retry);
  expect(retry).toHaveBeenCalledWith("Newer edit", "First edit");
  expect(sessions.hasUnsavedChanges).toBe(false);
});

it("keeps rejected saves recoverable even when no editor remains mounted", async () => {
  const sessions = new EditorSessions();
  const note = sessions.open("/vault/note.md", "Original");
  const close = note.subscribe(() => undefined);
  note.edit("Unsaved");
  const pending = note.save(async () => {
    throw new Error("Disk unavailable");
  });
  close();
  await expect(pending).rejects.toThrow("Disk unavailable");
  expect(sessions.open("/vault/note.md", "Original")).toBe(note);
  expect(note.content).toBe("Unsaved");
  expect(note.saving).toBe(false);
});

it("releases clean closed sessions and isolates paths", async () => {
  const sessions = new EditorSessions();
  const note = sessions.open("/vault/note.md", "Original");
  const close = note.subscribe(() => undefined);
  const other = sessions.open("/vault/other.md", "Other");
  other.edit("Other draft");
  note.edit("Saved");
  await note.save(async () => undefined);
  close();
  expect(sessions.open("/vault/note.md", "External edit").content).toBe("External edit");
  expect(other.content).toBe("Other draft");
  expect(other.originalContent).toBe("Other");
});

it("ignores refresh during pending save even if user undoes back to original", async () => {
  const sessions = new EditorSessions();
  const note = sessions.open("/vault/note.md", "Original");
  note.edit("Submitted");
  let complete!: () => void;
  const pending = note.save(() => new Promise<void>((resolve) => (complete = resolve)));
  note.edit("Original");
  note.refresh("External edit");
  expect(note.content).toBe("Original");
  expect(sessions.hasUnsavedChanges).toBe(true);
  complete();
  await pending;
  expect(note.originalContent).toBe("Submitted");
  expect(note.dirty).toBe(true);
});
