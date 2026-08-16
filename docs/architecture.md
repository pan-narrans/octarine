# Current Architecture

This document describes the implementation that exists today. Planned architecture belongs in `roadmap.md` and the ADRs.

## Data Flow

```text
Markdown vault
    │
    ├── external editor changes ──> native watcher
    │                                  │
    └── Tauri file/task commands       ▼
                                  Rust indexer
                                       │
                          source-preserving parser
                                       │
                                       ▼
                                  SQLite cache
                                       │
                                  Tauri IPC/events
                                       │
                                       ▼
                                 React frontend
```

Markdown is durable user data. SQLite is a derived cache.

## Frontend

The React frontend lives in `src/`. `App.tsx` currently coordinates most navigation, filtering, calendar, note, journal, and configuration behavior. Zustand stores task and custom-view state, while several components manage file-tree and editor presentation.

The frontend calls Tauri commands with `invoke` and listens for `vault-changed` events. Rust returns normalized task metadata, including tags, contexts, and source file paths, so the frontend does not reinterpret raw Markdown. Command payloads are still manually typed; generated contracts are a planned correction.

## Tauri Command Boundary

`src-tauri/src/main.rs` owns startup, application state, and command registration. Commands expose task queries and mutations, configuration, file operations, directory trees, and journal trees.

Commands accept path strings from the frontend but authorize them in Rust before filesystem access. Existing paths and destination parents are canonicalized and constrained to the configured vault or journal capability root. Task and vault-tree mutations are vault-only; content reads and writes may address either root. Traversal, root mutation, and symlink escapes are rejected.

## Parser

`src-tauri/src/parser.rs` is a Rust source-preserving structural scanner. It tracks lines, indentation, fenced code blocks, and comments, then extracts constrained inline metadata with regular expressions. It is not currently a CommonMark AST parser.

The parser retains exact line numbers and raw Markdown blocks for indexed tasks. It excludes metadata found in links, raw URLs, code spans, fenced code blocks, and comments. Nested checklist items are indexed separately with a derived parent hash.

The canonical implemented syntax is documented in `specifications/task-syntax.md` and `specifications/parser.md`.

## SQLite Index

`src-tauri/src/db.rs` initializes SQLite in WAL mode with foreign keys enabled. It stores files, tasks, tags, contexts, and custom views. File content and timestamps support change detection.

Task queries join the normalized tag and context associations and return them with each task, together with the source file path.

The cache stores separate schema and index-format versions. Startup preserves indexed rows when both versions match, skips unchanged files by modification time plus content hash, and removes records for files no longer present. A version mismatch clears derived rows once so the following sweep rebuilds them from Markdown.

## Filesystem Watcher

`src-tauri/src/watcher.rs` watches the initial vault recursively. For changed Markdown files it opens SQLite, indexes or deletes the file, and then emits a frontend event.

The watcher is currently leaked to keep it alive, is not replaced when the configured vault changes, and does not independently manage an external journal root. A managed watcher service is planned.

## Source Writes

`src-tauri/src/writer.rs` supports task status, schedule, and raw-block updates. Each command supplies the original source block, so mutation does not depend on SQLite cache timing. The writer checks the expected location and searches nearby after line shifts, rejecting a fallback when multiple nearby blocks match. Task and full-file edits use a temporary file in the source directory, preserve permissions, flush its contents, and atomically replace the original.

Structured conflict responses remain planned so the frontend can distinguish missing, changed, and ambiguous source failures without interpreting error text.

## Query Language

`src-tauri/src/query_dsl.rs` supports boolean expressions, parentheses, projects, contexts, tags, priorities, and comparisons for due date, status, and type. Supported relative dates are currently `today` and `tomorrow`.

The compiler validates a complete expression tree and emits SQL made from allowlisted fields and operators, with user values carried separately as bound parameters. Task columns are fully qualified for joined queries.

## Current Structural Limitations

- `App.tsx` contains several product features and substantial local state.
- Tauri commands, services, domain logic, and infrastructure are not yet separated into explicit boundaries.
- IPC types are duplicated manually between Rust and TypeScript.
- Configuration and cache files use home-directory dotfiles rather than platform application directories.
- Logging and user-facing errors are inconsistent.

These are migration targets, not requirements to refactor unrelated code. New work should follow `CONTRIBUTING.md` and the staged roadmap.
