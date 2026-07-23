# Hard-Won Lessons & Architectural Safeguards 🌌

This document compiles the core architectural lessons and development safeguards extracted during the development of Octarine v1.0. These standards must be referenced during future sprints to prevent regressions, task duplications, or metadata parsing anomalies in our local-first plaintext workspace.

---

## 🧱 Key Architectural Safeguards

### 1. Outermost Boundary Path Standardization Rule
*   **The Bug:** Modifying a note in an external editor caused tasks and scheduled events to visually double up on screen.
*   **The Root Cause:** *Path Representation Divergence*. The recursive directory scanner mapped notes using relative paths (e.g. `/./tasks.md`), while the OS file watcher (`watcher.rs`) returned fully canonicalized absolute paths (e.g. `/tasks.md`). Because the strings differed, SQLite's `UNIQUE(path)` constraint on the `files` table failed to trigger an overwrite. It inserted a second file row and duplicate task lists under both paths.
*   **The Standard:** All file paths must be **canonicalized** (e.g., using `std::fs::canonicalize` in Rust) at the outermost boundary of the application (scanners, file watchers, API entrypoints) before running any SQLite transactions, cache queries, or file operations. This guarantees that relative and absolute paths translate into a single, standardized absolute format.

### 2. Double-Stage Metadata Sanitization Rule
*   **The Bug:** An unclosed or closed Confluence link in a task (e.g. `[Jerarquía](https://teamnetconomy.atlassian.net/.../WIP+-+Jerarqu...)`) caused `+-` to be extracted and sidebar-indexed as an active project.
*   **The Root Cause:** *URL Parameter Leaks*. The raw URL string contains query and path parameters (like `+`, `@`, `#`, or `:`). When the regex matches projects/contexts/tags over the raw unstripped string, it matches these parameters and pollutes sidebar lists.
*   **The Standard:** Before running regex sweeps to extract task metadata (projects `+`, contexts `@`, tags `#`, or key-value fields like `s:`), you MUST execute a double-stage sanitization gate:
    1.  **Stage 1:** Strip standard closed Markdown links (`[anchor](url)`).
    2.  **Stage 2:** Strip any raw URL sequences starting with `http://` or `https://` up to whitespace (handles unclosed links and plain links).
    This completely purges any URL paths or query parameters while preserving links intact inside the user's task descriptions.

### 3. Startup Cache Invalidation Gate
*   **The Bug:** After fixing the backend link-exclusion parser, the invalid `+-` project *still* remained in the sidebar.
*   **The Root Cause:** *Cache Sweep Skips*. Octarine skips re-parsing unmodified files whose modified-times (`mtime`) on disk match their database cache records. Therefore, older notes containing Confluence links were never re-parsed, keeping legacy buggy database rows in SQLite.
*   **The Standard:** Any modifications to the Markdown parser regexes, whitelists, or status filters MUST be accompanied by an automated, one-time cache-invalidation gate (such as a database truncate or schema version increment) on application boot. Because SQLite is strictly a cache of local plaintext files, flushing the tables on boot is completely safe and lets our sub-millisecond sweep rebuild everything cleanly from scratch.

---

## 🚦 Caching & Context Retention Rule (Dev Guideline)
*   **The Bug:** Pruned visual capture triggers, icons, and state hooks accidentally reappeared in our major Notes Editor Mode full-file rewrite.
*   **The Root Cause:** *Context Caching Mismatch*. When drafting a full file write, it is easy to reference a baseline of the file from prior to a sanitization commit, causing a temporal regression.
*   **The Standard:** Before executing a full-file write, perform a strict git-status or git-diff review of the target file to ensure no previously pruned, deleted, or deprecated logic is accidentally re-introduced from older context templates. Use `replace` instead of full writes on large files whenever possible to minimize risk.
