import { expect, it, vi } from "vitest";
import { EditorSessions, isEditorPathWithin } from "./editor-sessions";

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

it("blocks directory mutations for closed dirty descendants without blocking sibling prefixes", async () => {
  const sessions = new EditorSessions();
  const note = sessions.open("/vault/notes/deep/note.md", "Original");
  note.edit("Draft");
  const operation = vi.fn().mockResolvedValue(undefined);
  await expect(sessions.withCleanPaths(["/vault/notes"], operation)).rejects.toThrow(
    "Save changes",
  );
  expect(operation).not.toHaveBeenCalled();
  await sessions.withCleanPaths(["/vault/notes-archive"], operation);
  expect(operation).toHaveBeenCalledOnce();
  expect(isEditorPathWithin("C:\\Vault\\Notes\\Draft.md", "c:/vault/notes/")).toBe(true);
  expect(isEditorPathWithin("/vault/notes2/a.md", "/vault/notes")).toBe(false);
});

it("blocks mutations while saving even after undo restores original text", async () => {
  const sessions = new EditorSessions();
  const note = sessions.open("/vault/note.md", "Original");
  note.edit("Submitted");
  let complete!: () => void;
  const pending = note.save(() => new Promise<void>((resolve) => (complete = resolve)));
  note.edit("Original");
  const operation = vi.fn().mockResolvedValue(undefined);
  await expect(sessions.withCleanPaths(["/vault"], operation)).rejects.toThrow("saving to finish");
  expect(operation).not.toHaveBeenCalled();
  complete();
  await pending;
});

it("locks existing and newly opened editors until native failure, then allows retry", async () => {
  const sessions = new EditorSessions();
  const note = sessions.open("/vault/note.md", "Original");
  const close = note.subscribe(() => undefined);
  let fail!: (reason: Error) => void;
  const pending = sessions.withCleanPaths(
    ["/vault"],
    () => new Promise<void>((_, reject) => (fail = reject)),
  );
  expect(note.locked).toBe(true);
  note.edit("Dropped input");
  expect(note.content).toBe("Original");
  const openedDuringMutation = sessions.open("/vault/other.md", "Other");
  expect(openedDuringMutation.locked).toBe(true);
  const overlapping = vi.fn().mockResolvedValue(undefined);
  await expect(sessions.withCleanPaths(["/vault/other.md"], overlapping)).rejects.toThrow(
    "current file operation",
  );
  expect(overlapping).not.toHaveBeenCalled();
  await sessions.withCleanPaths(["/another-vault"], async () => undefined);
  expect(note.locked).toBe(true);
  fail(new Error("Native failure"));
  await expect(pending).rejects.toThrow("Native failure");
  expect(note.locked).toBe(false);
  expect(openedDuringMutation.locked).toBe(false);
  await sessions.withCleanPaths(["/vault"], overlapping);
  expect(overlapping).toHaveBeenCalledOnce();
  note.edit("Accepted input");
  expect(note.content).toBe("Accepted input");
  close();
});
