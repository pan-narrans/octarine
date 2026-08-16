# Roadmap and Implementation Transitions

This document contains planned work. Items here are not current capabilities or enforceable contributor gates until implemented, verified, and moved into the owning current-state document.

## Documentation and Quality Baseline

- [x] Establish portable `AGENTS.md` and project-specific `CONTRIBUTING.md`.
- [x] Make Rust formatting, Clippy, and tests green.
- [x] Configure ESLint and Prettier and make their checks green.
- [x] Pin Node and Rust toolchains.
- Add pull-request CI after local gates pass.

## Core Correctness

- [x] Return complete task metadata from Rust and remove frontend reparsing.
- Generate TypeScript IPC contracts from Rust DTOs.
- [x] Make source edits independent of SQLite cache timing and atomically replace files.
- [x] Reject ambiguous source-match fallbacks.
- Return structured write conflicts.
- [x] Add schema and index-format versions; restore incremental startup indexing.
- [x] Validate and parameterize query expressions.

## Filesystem and Lifecycle Hardening

- [x] Enforce vault and journal directories as capability roots.
- [x] Reduce Tauri features and permissions to the minimum required.
- [x] Use typed, versioned configuration in platform application directories and migrate legacy dotfiles.
- [x] Replace the leaked startup watcher with a managed, reconfigurable watcher service.
- [x] Add structured local diagnostics with sensitive-data redaction and no telemetry by default.

## Incremental Organization

- Move the frontend toward feature-owned modules and typed IPC adapters.
- Move the backend toward command, service, domain, infrastructure, and startup boundaries.
- Extract code as affected features change; avoid a standalone wholesale rewrite.

## Product Roadmap

- Measured large-vault performance work, including batching or parallelism where profiling supports it.
- Frontend list virtualization where measured view size requires it.
- Mobile and browser targets.
- CRDT-based, end-to-end encrypted peer synchronization and auditable merge review.

Performance numbers, platform support, encryption, and synchronization must not be advertised as current until verified.

## First Production Deployment Transition

Before the first production deployment:

1. Create `develop` from the verified integration state.
2. Target ongoing feature work at `develop`.
3. Stabilize a release on `release/<version>`.
4. Run the complete release suite and update synchronized versions and `CHANGELOG.md`.
5. Merge the verified release into `master`.
6. Create an annotated `v<version>` tag on `master`.
7. Build production artifacts from that tag.
8. Merge release fixes back into `develop`.

After this transition, `master` represents production. Hotfixes branch from `master`, return to `master` with a new tag, and are also merged into `develop`.
