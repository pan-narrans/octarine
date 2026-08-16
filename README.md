# Octarine

Octarine is an early-stage, local-first desktop task manager and Markdown workspace. Markdown files remain the source of truth; a Rust backend indexes task metadata into SQLite and exposes it to a React interface through Tauri.

## Current Capabilities

- Parse Markdown checklist tasks with todo (`[ ]`), doing (`[/]`), done (`[x]`), cancelled (`[-]`), and event (`[<]`) markers.
- Extract projects, contexts, tags, priorities, dates, schedules, durations, recurrence text, and completion behavior.
- Index Markdown files into a local SQLite cache.
- Refresh frontend state when the native filesystem watcher observes Markdown changes.
- Browse, create, rename, edit, and delete Markdown files through the desktop interface.
- Display task, calendar, note, journal, project, context, tag, and embedded custom-query views.
- Apply task-level edits with location and source-content checks.

Octarine is under active development. IPC contracts are still maintained manually, and structured diagnostics and write conflicts remain incomplete. See `docs/architecture.md` and `docs/roadmap.md` for the honest implementation boundary.

## Planned, Not Implemented

- End-to-end encrypted peer-to-peer synchronization.
- CRDT-based merging and merge review.
- Mobile and browser/WASM clients.
- Parallel boot indexing and measured large-vault performance guarantees.
- Frontend list virtualization.
- A complete generated IPC contract layer.

## Technology

- React 18 and TypeScript.
- Vite.
- Zustand.
- Tauri 1.
- Rust.
- SQLite through `rusqlite`.
- Native filesystem events through `notify`.

## Repository Layout

```text
.
├── AGENTS.md
├── CONTRIBUTING.md
├── docs/
│   ├── adr/
│   ├── development/
│   ├── specifications/
│   ├── architecture.md
│   ├── roadmap.md
│   ├── safeguards.md
│   └── vision.md
├── src/
├── src-tauri/
├── package.json
└── vite.config.ts
```

The directory containing this README is the effective project root. If the repository is managed through multiple worktrees, open and work inside the selected worktree rather than its orchestration parent.

## Development

Use the Node version in `.node-version` and the Rust version in `rust-toolchain.toml`. With the platform-specific Tauri prerequisites available:

```bash
npm ci
npm run format:check
npm run lint
npm run build
```

Run the desktop application with the Tauri CLI:

```bash
npx tauri dev
```

Backend checks run from `src-tauri/`:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Read `CONTRIBUTING.md` before making changes. Product purpose is documented in `docs/vision.md`; current internals are documented in `docs/architecture.md`.
