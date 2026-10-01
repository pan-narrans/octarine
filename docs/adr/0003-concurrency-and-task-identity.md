# ADR 0003: Concurrency & Task Identity (Strict Hashing)

## Status

Approved

## Implementation Status

Implemented. Commands provide the original source block, location/content hashes and ambiguity-aware nearby source matching exist, file replacement is atomic, and write commands return structured conflict codes. Frontend task-edit paths decode conflicts, refresh from the authoritative source, and present the safe failure message.

## Context

Tasks must be identifiable so the UI can send commands (like "mark as complete") to the backend. Injecting unique IDs (like HTML comments) into the Markdown files bloats the plaintext. Alternatively, relying on exact line numbers is dangerous because external editors might add/remove lines, causing the app to overwrite the wrong data.

## Decision

We will use a **Strict Location & Content Hashing** strategy to guarantee 100% pure plaintext without risk of data corruption, coordinated over Tauri's IPC event model.

1. **Identity:** A task in the UI is identified by a composite hash of: `FilePath + AST Node Start Line + Exact Raw Markdown Content`.
2. **Execution:** When the Rust backend receives a Tauri command (e.g., check/complete task), it checks if the target file at that specific line still exactly matches the raw content hash.
3. **Collision Handling:** If the hash fails (meaning the file was modified externally between the UI render and the click), the update is aborted safely. Rust emits an IPC collision event, the frontend shows a brief warning toast, and immediately refreshes the UI state based on the new filesystem read.

## Consequences

- **Positive:** Zero bloat in the Markdown files. Guarantees that the app will never corrupt data by writing to the wrong line.
- **Negative:** Highly concurrent edits (e.g., typing on the exact same line in Obsidian while clicking "Complete" in the UI) will result in a harmless rejected update and UI refresh. This is an acceptable trade-off for pristine plaintext.
- **v2.0 Path:** In v2.0, when P2P syncing is active, standard local edits continue to use this safe write-validation. However, concurrent sync conflicts between separate offline devices are automatically merged character-by-character via Yjs/Automerge CRDTs and indexed inside SQLite (`merge_reviews`) for user auditing.
