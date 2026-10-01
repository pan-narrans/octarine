import { invoke } from "@tauri-apps/api/core";
import type { AttachmentImportResult } from "../../generated/ipc/AttachmentImportResult";
import type { MarkdownLinkTarget } from "../../generated/ipc/MarkdownLinkTarget";
import type { FileNode } from "../../types";

export const getVaultConfig = (): Promise<string> => invoke("get_vault_config");
export const getJournalConfig = (): Promise<string> => invoke("get_journal_config");
export const readVaultTree = (): Promise<FileNode> => invoke("read_dir_tree");
export const readJournalTree = (): Promise<FileNode> => invoke("read_journal_tree");

export const setVaultConfig = (newDir: string): Promise<void> =>
  invoke("set_vault_config", { newDir });
export const setJournalConfig = (newDir: string): Promise<void> =>
  invoke("set_journal_config", { newDir });
export const readFileContent = (path: string): Promise<string> =>
  invoke("read_file_content", { path });
// Null is create-only; false result means Markdown saved but derived index needs refresh.
export async function writeFileContent(
  path: string,
  content: string,
  originalContent: string | null,
): Promise<boolean> {
  const indexed = await invoke<unknown>("write_file_content", { path, content, originalContent });
  if (typeof indexed !== "boolean") throw new Error("Invalid file save response.");
  return indexed;
}
export const createFile = (parentDir: string, name: string): Promise<string> =>
  invoke("create_file", { parentDir, name });
export const createDirectory = (parentDir: string, name: string): Promise<void> =>
  invoke("create_directory", { parentDir, name });
export const deletePath = (path: string): Promise<void> => invoke("delete_path", { path });
export const renamePath = (oldPath: string, newPath: string): Promise<void> =>
  invoke("rename_path", { oldPath, newPath });

export const reindexFile = (path: string): Promise<void> => invoke("reindex_file", { path });

export async function resolveMarkdownLink(
  documentPath: string,
  target: string,
): Promise<MarkdownLinkTarget> {
  const result = await invoke<unknown>("resolve_markdown_link", { documentPath, target });
  if (
    typeof result !== "object" ||
    result === null ||
    typeof (result as MarkdownLinkTarget).path !== "string" ||
    !("fragment" in result) ||
    ((result as MarkdownLinkTarget).fragment !== null &&
      typeof (result as MarkdownLinkTarget).fragment !== "string")
  ) {
    throw new Error("Invalid Markdown link response.");
  }
  return result as MarkdownLinkTarget;
}

export async function importAttachment(
  documentPath: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<AttachmentImportResult> {
  const result = await invoke<unknown>("import_attachment", {
    documentPath,
    fileName,
    bytes: Array.from(bytes),
  });
  if (
    typeof result !== "object" ||
    result === null ||
    typeof (result as AttachmentImportResult).fileName !== "string" ||
    typeof (result as AttachmentImportResult).relativePath !== "string"
  ) {
    throw new Error("Invalid attachment import response.");
  }
  return result as AttachmentImportResult;
}
