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

The current commands accept path strings from the frontend. Complete validation against configured vault and journal roots is not yet centralized; this is a known security gap tracked in `roadmap.md`.

## Parser

`src-tauri/src/parser.rs` is a Rust source-preserving structural scanner. It tracks lines, indentation, fenced code blocks, and comments, then extracts constrained inline metadata with regular expressions. It is not currently a CommonMark AST parser.

The parser retains exact line numbers and raw Markdown blocks for indexed tasks. It excludes metadata found in links, raw URLs, code spans, fenced code blocks, and comments. Nested checklist items are indexed separately with a derived parent hash.

The canonical implemented syntax is documented in `specifications/task-syntax.md` and `specifications/parser.md`.

## SQLite Index

`src-tauri/src/db.rs` initializes SQLite in WAL mode with foreign keys enabled. It stores files, tasks, tags, contexts, and custom views. File content and timestamps support change detection.

Task queries join the normalized tag and context associations and return them with each task, together with the source file path.

The application currently clears core index tables at every launch before sweeping the vault. As a result, incremental startup caching is not yet active despite support in the indexer. The planned correction introduces schema and index-format versions and rebuilds only when required.

## Filesystem Watcher

`src-tauri/src/watcher.rs` watches the initial vault recursively. For changed Markdown files it opens SQLite, indexes or deletes the file, and then emits a frontend event.

The watcher is currently leaked to keep it alive, is not replaced when the configured vault changes, and does not independently manage an external journal root. A managed watcher service is planned.

## Source Writes

`src-tauri/src/writer.rs` supports task status, schedule, and raw-block updates. Each command supplies the original source block, so mutation does not depend on SQLite cache timing. The writer checks the expected location and searches nearby after line shifts. Task and full-file edits use a temporary file in the source directory, preserve permissions, flush its contents, and atomically replace the original.

The remaining safe-write hardening is to detect and reject ambiguous fallback matches rather than accepting the first nearby match.

## Query Language

`src-tauri/src/query_dsl.rs` supports boolean expressions, parentheses, projects, contexts, tags, priorities, and comparisons for due date, status, and type. Supported relative dates are currently `today` and `tomorrow`.

The compiler currently produces SQL fragments. A validated expression tree with bound parameters and fully qualified columns is planned before expanding the language.

## Current Structural Limitations

- `App.tsx` contains several product features and substantial local state.
- Tauri commands, services, domain logic, and infrastructure are not yet separated into explicit boundaries.
- IPC types are duplicated manually between Rust and TypeScript.
- Configuration and cache files use home-directory dotfiles rather than platform application directories.
- Logging and user-facing errors are inconsistent.

These are migration targets, not requirements to refactor unrelated code. New work should follow `CONTRIBUTING.md` and the staged roadmap.
