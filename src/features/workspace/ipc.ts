import { invoke } from "@tauri-apps/api/core";
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
