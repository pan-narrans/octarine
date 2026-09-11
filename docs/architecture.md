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

The React frontend lives in `src/`. `App.tsx` currently coordinates most navigation, filtering, calendar, note, journal, project-presentation, and configuration behavior. Zustand stores task and custom-view state, performs targeted optimistic Kanban movement, and reconciles from native indexed state. Several components manage file-tree and editor presentation.

Project routes reuse `src/features/kanban/KanbanBoard.tsx`. One globally persisted client-local preference selects Board or List; fresh profiles use Board. Pure projection logic scopes exact and descendant projects, removes events and child cards, groups by indexed primary context, and sorts deterministically. Groups above 50 cards use `@tanstack/react-virtual`; board container owns horizontal overflow.

Feature-owned adapters under `src/features/*/ipc.ts` are the only frontend modules that call Tauri commands. Rust returns normalized task metadata, including tags, contexts, and source file paths, so the frontend does not reinterpret raw Markdown. Shared response and error DTOs are generated from Rust into `src/generated/ipc`; frontend aliases and runtime guards live in `src/types`.

Task creation orchestration lives in `src/features/tasks/use-task-creation-controller.ts` and its
bounded Zustand state. Main application mounts global action and shared modal. Controller derives
capture context from current project/context/tag view, requests native preview, deduplicates writes,
and reconciles returned indexed task directly. Reusable notification store owns newest-first bounded
feedback, timed dismissal, persistent failures, Open file, Undo, and index-refresh recovery actions.

## Tauri Command Boundary

`src-tauri/src/main.rs` owns startup and command registration. `app_state.rs` owns the shared runtime resources, while `watcher_service.rs` owns watcher construction and frontend event wiring. Commands expose task queries and mutations, configuration, file operations, directory trees, and journal trees; parser, writer, query, database, configuration, diagnostics, watcher, and filesystem modules provide the domain and infrastructure behavior behind them.

Commands accept path strings from the frontend but authorize them in Rust before filesystem access. Existing paths and destination parents are canonicalized and constrained to the configured vault or journal capability root. Task and vault-tree mutations are vault-only; content reads and writes may address either root. Traversal, root mutation, and symlink escapes are rejected.

The webview allowlist disables blanket Tauri API access. Its only optional native API permission is opening validated HTTP or HTTPS links; command invocation and application events use Tauri's core IPC boundary.

Configuration is a typed, versioned JSON document stored under the platform configuration directory for `com.octarine.app`. On first use, values from the legacy `~/.octarine_config.json` file are imported without deleting the original. Vault and journal environment overrides are applied independently at runtime and are not persisted.

Native operational diagnostics are written locally as capped JSON Lines in `diagnostics.jsonl` beside the platform configuration. Events contain a timestamp, severity, stable event code, and static redacted message; note contents, queries, and filesystem paths are not recorded. The application has no diagnostic upload or telemetry path.

## Parser

`src-tauri/src/parser.rs` is a Rust source-preserving structural scanner. It tracks lines, indentation, fenced code blocks, and comments, then extracts constrained inline metadata with regular expressions. It is not currently a CommonMark AST parser.

The parser retains exact line numbers and raw Markdown blocks for indexed tasks. It excludes metadata found in links, raw URLs, code spans, fenced code blocks, and comments. Nested checklist items are indexed separately with a derived parent hash.

The canonical implemented syntax is documented in `specifications/task-syntax.md` and `specifications/parser.md`.

## SQLite Index

`src-tauri/src/db.rs` initializes SQLite in WAL mode with foreign keys enabled. It stores files, tasks, tags, contexts, and custom views. File content and timestamps support change detection.

Task queries join normalized tag and ordered context associations and return them with each task, together with source file path. `tasks.primary_context` stores first source-order context for effective context queries and Kanban grouping; complete ordered context arrays remain available for preservation and editing.

The cache stores separate schema and index-format versions. Startup preserves indexed rows when both versions match, skips unchanged files by modification time plus content hash, and removes records for files no longer present. A version mismatch clears derived rows once so the following sweep rebuilds them from Markdown.

The disposable database is stored as `com.octarine.app/index.sqlite3` under the operating system's platform cache directory. Older home-directory cache files are ignored and may be removed manually because Markdown remains authoritative.

## Filesystem Watcher

`src-tauri/src/watcher.rs` watches the initial vault recursively. For changed Markdown files it opens SQLite, indexes or deletes the file, and then emits a frontend event.

The active native watcher is owned by application state. Reconfiguring the vault constructs and validates a replacement watcher, reindexes the selected vault, and then swaps it into state; dropping the previous watcher closes its event channel and event loop. The journal root is intentionally not indexed or watched as part of the task vault.

## Source Writes

`src-tauri/src/writer.rs` supports task status, atomic Kanban status/primary-context moves, schedule, and raw-block updates. Each command supplies original source block, so mutation does not depend on SQLite cache timing. Writer checks expected location and searches nearby after line shifts, rejecting fallback when multiple nearby blocks match. Task and full-file edits use temporary file in source directory, preserve permissions, flush contents, and atomically replace original.

Task write commands return structured errors with stable codes for missing, changed, ambiguous, invalid, and operational failures. Frontend task-edit paths distinguish concurrency conflicts without interpreting human-readable error text, refresh task state, and present the redacted message.

Task creation uses preview/create/undo commands backed by one serialized native service. Rust resolves
configured vault-relative destination, renders template, inserts full task subtree atomically,
reindexes written file, and returns indexed task plus bounded Undo receipt. Missing or duplicate
heading/marker targets fall back to EOF with stable warning code. Index failure is reported only after
durable Markdown write, allowing frontend to close capture and offer explicit refresh recovery.

Existing-task project changes use destination-first subtree move through same serialized task service.
Hierarchical project rename uses deterministic native preflight stored behind bounded opaque plan
token, then guarded execution under shared mutation lock. Planner scans non-ignored Markdown, records
source fingerprints and collision state, and maps conventional project file plus descendant directory.
Executor atomically rewrites task metadata, moves planned paths, and reconciles affected index rows.
Partial failure returns structured recovery report; no global atomicity or automatic rollback is
claimed. Large-vault rename measurement and reproduction command live in
`development/project-rename-performance.md`. Accepted benchmark fixture contains 20,000 Markdown
files and 2,000,000 indexed tasks (100 per file) on local SSD. Current fixture has no recorded timing;
older 200,000-task results remain historical only.

Rename collisions can enter staged project merge. Native preflight recursively maps source into
existing destination, classifies Markdown, ordinary file, ignored opaque, and path-kind conflicts,
and stores user resolutions behind opaque plan token. Preparation materializes complete output under
`.octarine/staging` without changing project data. Explicit commit revalidates fingerprints, moves
originals into `.octarine/recovery`, installs destination outputs atomically per entry, removes source
last, and reconciles index. Stop takes effect between atomic operations. Successful recovery expires
after 30 days; partial, stopped, and failed recovery remains until manual deletion.

## Query Language

`src-tauri/src/query_dsl.rs` supports boolean expressions, parentheses, projects, contexts, tags, priorities, and comparisons for due date, status, and type. Supported relative dates are currently `today` and `tomorrow`.

The compiler validates a complete expression tree and emits SQL made from allowlisted fields and operators, with user values carried separately as bound parameters. Task columns are fully qualified for joined queries.

## Current Structural Limitations

- `App.tsx` contains several product features and substantial local state.
- Tauri commands remain registered in the startup shell rather than feature-specific command modules.
- IPC DTOs are generated from Rust; frontend runtime response guards remain manual.
- User-facing errors are inconsistent.

These are migration targets, not requirements to refactor unrelated code. New work should follow `CONTRIBUTING.md` and the staged roadmap.
