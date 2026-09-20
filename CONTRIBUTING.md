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

## Git Model

`master` is the only permanent branch and represents latest stable source. Work never lands directly
on `master`.

Each planned version gets unprotected integration branch named `release/<version>`, such as
`release/0.1.0`. Features and fixes target release selected for them through pull requests even
though GitHub does not enforce branch protection on release branches. Multiple release branches may
exist concurrently when versions need independent development. Beta is distribution channel
represented by prerelease tags and updater manifest, not permanent branch. Repository has no
permanent `develop` or `beta` branch. `master` is only protected branch.

Short-lived branches use one of these forms:

- `feature/<issue>-<slug>`
- `fix/<issue>-<slug>`
- `docs/<slug>`
- `refactor/<slug>`
- `chore/<slug>`
- `hotfix/<issue>-<slug>`

Omit issue number when no issue exists. Short-lived task branches are squash-merged into selected
`release/*` branch. Stable hotfixes target `master` and are forwarded into affected active release
branches. See `docs/development/git.md`.

Beta tags such as `v0.1.0-beta.1` point to verified tips of corresponding release branch. Stable
release is merged through pull request into `master`, then tagged there as `v0.1.0`. Published tags
are immutable. Every `v*` tag requires successful Quality and Security checks on target commit.

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
cargo test --all-targets
```

Run `npm run ipc:generate` after changing a shared Rust DTO and commit generated files. These commands
must be enforced by `Quality` workflow for pull requests targeting `master` or `release/**`. See
`docs/development/testing.md` for scope-aware verification.

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
- `docs/visual-development.md`
- `docs/DESIGN.md`

## Documentation Ownership

- `README.md`: current product, prerequisites, and quick start.
- `docs/vision.md`: enduring product purpose.
- `docs/architecture.md`: currently implemented system and known gaps.
- `docs/roadmap.md`: planned work and release transitions.
- `docs/specifications/`: implemented behavior contracts.
- `docs/adr/`: decisions and their implementation status.
- `docs/safeguards.md`: regression-prevention invariants learned from failures.

A change that alters user-visible behavior, an interface, an architectural invariant, or a contributor command must update its owning documentation in the same change. Do not rewrite an ADR to hide history; supersede it with a new ADR when a decision changes.
