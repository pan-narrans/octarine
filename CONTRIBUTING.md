# Contributing to Octarine

This is the authoritative entry point for Octarine-specific development policy. General agent behavior is defined in `AGENTS.md`.

## Effective Repository Root

Octarine may be checked out as one of several Git worktrees. The directory containing this file is the effective repository root. Run searches, builds, tests, and edits only within the active worktree. Do not inspect or modify sibling worktrees unless explicitly requested.

A worktree is an ownership boundary. At most one writing agent may own a worktree at a time. Read-only inspection may be shared. Creating or removing branches and worktrees requires explicit authorization.

## Project Layout

- `src/`: React and TypeScript frontend.
- `src-tauri/`: Rust backend and Tauri application shell.
- `docs/development/`: enforceable contributor rules.
- `docs/specifications/`: normative descriptions of implemented formats and interfaces.
- `docs/adr/`: durable architecture decisions.
- `.agents/`: pinned, project-agnostic task skills.

## Current Git Model

Before the first production deployment, `master` is the integration branch. Short-lived branches target `master` and use one of these forms:

- `feature/<issue>-<slug>`
- `fix/<issue>-<slug>`
- `docs/<slug>`
- `refactor/<slug>`
- `chore/<slug>`
- `release/<version>`
- `hotfix/<issue>-<slug>`

Omit the issue number when no issue exists. Short-lived task branches are squash-merged. See `docs/development/git.md`.

Before the first production deployment, adopt the develop/release model described in `docs/roadmap.md`. From that point, `master` must represent production.

## Verification

The required frontend gate is:

```bash
npm run ipc:check
npm run format:check
npm run lint
npm run build
```

The required Rust gate is:

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Run `npm run ipc:generate` after changing a shared Rust DTO and commit the generated files. These commands are green locally. CI enforcement remains roadmap work; do not describe a planned CI check as enforced until it exists. See `docs/development/testing.md` for scope-aware verification.

## Architectural Invariants

- Markdown files are the durable source of truth.
- SQLite is a disposable derived index and must be rebuildable from Markdown.
- Rust owns canonical parsing, validation, indexing, and filesystem mutation.
- The frontend accesses native functionality through typed Tauri commands and events.
- Paths must be canonicalized and constrained to configured roots before comparison or mutation.
- Task-level writes must validate their original source and fail safely on ambiguous or missing matches.
- External changes must be indexed before the frontend is notified.
- Parser or schema changes that alter indexed meaning require an explicit cache-version or migration strategy.
- Security, performance, privacy, and platform claims must not be presented as implemented until verified.

## Development Guides

- `docs/development/git.md`
- `docs/development/rust.md`
- `docs/development/typescript.md`
- `docs/development/testing.md`

## Documentation Ownership

- `README.md`: current product, prerequisites, and quick start.
- `docs/vision.md`: enduring product purpose.
- `docs/architecture.md`: currently implemented system and known gaps.
- `docs/roadmap.md`: planned work and release transitions.
- `docs/specifications/`: implemented behavior contracts.
- `docs/adr/`: decisions and their implementation status.
- `docs/safeguards.md`: regression-prevention invariants learned from failures.

A change that alters user-visible behavior, an interface, an architectural invariant, or a contributor command must update its owning documentation in the same change. Do not rewrite an ADR to hide history; supersede it with a new ADR when a decision changes.

## Skills

The `.agents` submodule contains reusable procedures, not Octarine policy. A skill must discover and obey this repository's rules. Project-specific overrides must not be added inside `.agents`.

Pin `.agents` to a reviewed revision and update it through a focused submodule change. A skill correction belongs in the submodule's source repository.
