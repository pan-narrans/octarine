# Roadmap and Implementation Transitions

This document contains planned work. Items here are not current capabilities or enforceable contributor gates until implemented, verified, and moved into the owning current-state document.

## Documentation and Quality Baseline

- [x] Establish portable `AGENTS.md` and project-specific `CONTRIBUTING.md`.
- [x] Make Rust formatting, Clippy, and tests green.
- [x] Configure ESLint and Prettier and make their checks green.
- [x] Pin Node and Rust toolchains.
- [x] Add pull-request CI after local gates pass.

## Core Correctness

- [x] Return complete task metadata from Rust and remove frontend reparsing.
- [x] Generate TypeScript IPC contracts from Rust DTOs.
- [x] Make source edits independent of SQLite cache timing and atomically replace files.
- [x] Reject ambiguous source-match fallbacks.
- [x] Return structured write conflicts.
- [x] Add schema and index-format versions; restore incremental startup indexing.
- [x] Validate and parameterize query expressions.

## Filesystem and Lifecycle Hardening

- [x] Enforce vault and journal directories as capability roots.
- [x] Reduce Tauri features and permissions to the minimum required.
- [x] Use typed, versioned configuration in platform application directories and migrate legacy dotfiles.
- [x] Replace the leaked startup watcher with a managed, reconfigurable watcher service.
- [x] Add structured local diagnostics with sensitive-data redaction and no telemetry by default.

## Incremental Organization

- [x] Move the frontend toward feature-owned modules and typed IPC adapters.
- [x] Move the backend toward command, service, domain, infrastructure, and startup boundaries.
- Extract code as affected features change; avoid a standalone wholesale rewrite.

## Product Roadmap

- [x] Add project Kanban with Deferred status, primary-context grouping, source-safe drag movement, closed filters, and large-group virtualization.
- [x] Add global task capture with vault-aware routing, configurable insertion, structured composer,
      global result feedback, Open file, and bounded Undo.
- [x] Add confirmed existing-task project moves with whole-subtree preservation and guarded recovery.
- [x] Add guarded hierarchical project rename with preflight, collision detection, case-only macOS
      handling, task-token rewrites, filesystem moves, and partial-failure recovery.
- [x] Add staged project merge for rename collisions with explicit conflict resolution, cancellable
      dry run, guarded commit, safe stop, and 30-day successful recovery.
- Measure accepted 20,000-file, 2,000,000-task local-SSD fixture, then add batching or parallelism
  where profiling supports it.
- Extend virtualization to other unbounded frontend lists where measured view size requires it.
- Mobile and browser targets.
- CRDT-based, end-to-end encrypted peer synchronization and auditable merge review.

## Distribution and Updates

- [x] Migrate desktop shell to Tauri 2 and application identifier to `net.auranimnus.octarine`.
- [x] Add stable/beta update preference, automatic check, explicit install confirmation, and signed
      direct/AppImage update path.
- [x] Simplify v1 distribution to signed self-updating macOS DMG and Linux AppImage.
- [x] Add launch plus 24-hour checks, explicit restart confirmation, retry/download fallback, and
      signed downgrade support.
- [x] Configure public release endpoints and updater signing secrets before first published build.
- [x] Add GitHub Actions draft release builds and publish-triggered updater manifest deployment.
- [x] Add stable/beta SemVer routing and explicit signed channel rollback workflow.
- Run signed upgrade, downgrade, rollback, failure, and Gatekeeper smoke matrix before v1 publication.
- Reconsider Homebrew, APT, DNF, Linux ARM64, macOS Intel, and Windows only after demonstrated demand.

Performance numbers, platform support, encryption, and synchronization must not be advertised as current until verified.

## Release-Branch Model Transition

Before first public Beta:

1. Move unpushed work from legacy `develop` checkout to short-lived work branches.
2. Create `release/0.1.0` from selected verified baseline.
3. Update Quality and Security workflows to cover PRs targeting `master` and `release/**`.
4. Update release validation so prerelease tags belong to matching `release/*` branch and stable tags
   belong to `master`.
5. Protect `master`, `release/**`, and `v*` tags against bypass, force updates, and deletion.
6. Stop using and remove permanent `develop` branch after all intended work is represented elsewhere.
7. Follow `docs/development/releasing.md` for Beta iterations and stable promotion.

After first stable publication, `master` represents production. Hotfixes branch from `master`, return
through PR with new stable tag, and are forwarded through PR into affected active release branches.
