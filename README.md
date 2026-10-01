# Octarine

Octarine is an early-stage, local-first desktop task manager and Markdown workspace. Markdown files remain the source of truth; a Rust backend indexes task metadata into SQLite and exposes it to a React interface through Tauri.

## Current Capabilities

- Parse Markdown checklist tasks with todo (`[ ]`), doing (`[/]`), deferred (`[>]`), done (`[x]`), cancelled (`[-]`), and event (`[<]`) markers.
- Extract projects, contexts, tags, priorities, dates, schedules, durations, recurrence text, and completion behavior.
- Index Markdown files into a local SQLite cache.
- Refresh frontend state when the native filesystem watcher observes Markdown changes.
- Browse, create, rename, edit, and delete Markdown files through the desktop interface.
- Display task, calendar, note, journal, project, context, tag, and embedded custom-query views.
- Review exact and descendant project tasks on Kanban boards grouped by primary context, with optional closed columns and source-safe movement.
- Apply task-level edits with location and source-content checks.
- Capture tasks into configured inbox, daily, or hierarchical project notes.
- Rename project hierarchies and merge rename collisions through cancellable staging, explicit
  conflict resolution, guarded commit, and local recovery.

Octarine is under active development. See `docs/architecture.md` and `docs/roadmap.md` for the honest implementation boundary.

## Distribution Target

First public release will provide two direct downloads through GitHub Releases:

- macOS 15 Sequoia or newer on Apple Silicon: open DMG, drag Octarine into Applications, then use
  macOS contextual Open flow for initial Gatekeeper approval.
- Linux x86_64: download AppImage, run `chmod +x Octarine*.AppImage`, keep file in user-writable
  directory, then launch it directly.

Packaged app checks selected stable or beta channel on launch and every 24 hours while running. It
downloads no binary until user selects Update now. Signed update installs and restarts immediately.
Failure keeps current version and offers retry plus GitHub Releases fallback.

Homebrew, APT, and DNF installation are not v1 targets. Public binaries are not available until first
release passes signed cross-platform smoke matrix.

## Planned, Not Implemented

- End-to-end encrypted peer-to-peer synchronization.
- CRDT-based merging and merge review.
- Mobile and browser/WASM clients.
- Parallel boot indexing and measured performance guarantees for accepted 20,000-file,
  2,000,000-task local-SSD baseline.
- Virtualization for unbounded non-Kanban frontend lists.

## Technology

- React 18 and TypeScript.
- Vite.
- Zustand.
- Tauri 2.
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
npm run ipc:check
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
cargo test --all-targets
```

Read `CONTRIBUTING.md` before making changes. Product purpose is documented in `docs/vision.md`;
current internals are documented in `docs/architecture.md`; release prerequisites are documented in
`docs/development/releasing.md`.
