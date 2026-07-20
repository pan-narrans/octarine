# Parser Specification & Concurrency Resiliency

This document defines the strict parsing contracts and safety mechanisms for extracting tasks, resolving hierarchical lists, and performing safe filesystem modifications conceptually.

---

## 1. Markdown AST Parser Boundaries

To handle multi-line tasks and nested lists robustly, the parser uses Markdown AST-based parsing (built on top of `remark` or `markdown-it`) rather than flat regex scanning.

### 1.1 Structural Nodes
A list block consists of List Items. A single Task/Event is represented by an AST `ListItem` node containing a checkbox.

*   **Task Header (Line 1):** Renders as the `ListItem`. The first line constitutes the *Task Header*, containing the main description, project, context, and key-values.
*   **Body/Notes Block (Multi-line):** Any subsequent indented block (paragraphs, code blocks) that is *not* a child list is parsed as the task's descriptive **Note**. These lines are bundled into the task's raw text and description storage fields.
*   **Sub-tasks:** An indented bullet point *with* a checkbox is evaluated as a distinct task in SQLite, maintaining a logical parent/child dependency tree.

---

## 2. Tokenizer Rules (Extraction Patterns)

Inline metadata elements are extracted from text nodes using the following conceptual prefixes:

- **Projects (`+`):** Triggers hierarchical paths (e.g., `+work/client/project-a`).
- **Contexts (`@`):** Identifies context boundaries (e.g., `@computer`, `@phone`).
- **Hashtags (`#`):** Marks general tags (e.g., `#urgent`, `#personal`).
- **Key-Value Pairs (`key:value`):** Identifies metadata bindings (e.g., `due:2026-07-18`, `recurring:"0 0 * * 0"`, `when_done:archive`).

---

## 3. Graceful Error Degradation (Fault Tolerance)

If a task contains syntactically invalid data (e.g., `due:2026-02-31` or `recurring: invalid_cron`):
1. The line is still parsed and registered.
2. The invalid field is ignored for execution logic (e.g., it is not indexed as an active event, and no cron triggers).
3. The invalid element is converted into a structured error object and saved to the SQLite `parse_errors` column.
4. The React UI displays a small warning indicator next to this task, exposing the tooltip message so the user can easily fix the plaintext formatting inside their editor.

---

## 4. Concurrency: Line-Shift Resiliency Algorithm

When editing a task from the React UI, we write back to the filesystem. To maintain 100% pure plaintext without injecting IDs, we utilize a self-healing line-shift algorithm to solve the "Obsidian edited concurrently" race condition.

### Conceptual Flow:
1. **Request:** The UI sends an update request specifying `FilePath`, `OriginalLineNumber`, `OriginalContentHash`, and `NewMarkdownBlock`.
2. **Phase 1 (Direct Match):**
   * Read file.
   * If the line at `OriginalLineNumber` matches the `OriginalContentHash`, write the update directly and exit.
3. **Phase 2 (Nearby Search Fallback):**
   * If Phase 1 fails (due to a line shift), scan up and down within a search radius (e.g., up to 15 lines in both directions).
   * Check if any nearby line matches the `OriginalContentHash`.
   * If a match is found, apply the edit to that line number instead, and commit the file.
4. **Phase 3 (Conflict Resolution):**
   * If the hash is not found within the radius, abort the transaction safely.
   * Notify the UI of the concurrency collision to trigger an instant Tauri Event-driven page refresh.
