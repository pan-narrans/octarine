# Actionable Implementation Backlog: Project Merge

Source: `PROJECT_MERGE_PROJECT_DEFINITION.md`

Sequence matters. Visual work follows mandatory
`Storybook implementation → exact approval → app integration` gate. Commits, branches, pull requests,
and external actions remain outside backlog authorization.

## Phase 1: Foundation and Data Model

### PM-101 - Record Project Merge Architecture Decision

- **Description:** Add ADR defining destination-owned recursive merge, staged dry run, explicit commit
  boundary, per-file atomicity, safe-stop semantics, recovery bundles, cleanup, and unsupported cases.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - [ ] ADR distinguishes clean dry-run cancellation from safe stop after commit begins.
  - [ ] ADR rejects whole-vault atomicity, Git dependency, ancestor/descendant merge, and symlinks.
  - [ ] ADR preserves Markdown authority and disposable SQLite index.
  - [ ] ADR records macOS-only verification scope.
- **Validation / Verification:**
  - _How to verify:_ Compare ADR against approved project definition; run
    `npx prettier --check docs/adr/<merge-adr>.md`.

### PM-102 - Implement Merge Identity and Tree Planner

- **Description:** Build deterministic native planner for source/destination identities, recursive
  descendants, project notes, directory entries, ignored paths, source fingerprints, and blockers.
- **Dependencies:** PM-101.
- **Acceptance Criteria:**
  - [ ] Exact and descendant source projects map to destination by path segment.
  - [ ] Matching destination descendants become recursive merges; lookalike prefixes stay unchanged.
  - [ ] Source/destination ancestry blocks with structured error.
  - [ ] Any symlink inside either merge tree blocks before staging.
  - [ ] Hidden and ignored content is discovered as opaque path metadata without content reads.
  - [ ] Plans are deterministic and bound to opaque token.
- **Validation / Verification:**
  - _How to verify:_ Add temporary-vault planner tests for identity, descendants, ancestry, case-fold,
    hidden/ignored paths, symlinks, file/directory shapes, and deterministic token; run
    `cd src-tauri && cargo test project_merge --lib`.

### PM-103 - Add Staging and Recovery Domains

- **Description:** Add vault-confined staging and recovery workspace managers with manifests,
  permission preservation, lifecycle state, and cleanup policy.
- **Dependencies:** PM-101.
- **Acceptance Criteria:**
  - [ ] Staging uses `.octarine/staging/<operation-id>/` beneath canonical vault.
  - [ ] Recovery uses `.octarine/recovery/<operation-id>/` beneath canonical vault.
  - [ ] Operation IDs and relative entries cannot escape roots or introduce symlinks.
  - [ ] Manifest records paths, hashes, types, timestamps, resolutions, and operation progress without
        task text or external absolute paths.
  - [ ] Successful bundles expire after 30 days at next startup.
  - [ ] Partial, stopped, and recovery-failed bundles never auto-expire.
  - [ ] Original file permissions survive staging and recovery moves.
- **Validation / Verification:**
  - _How to verify:_ Add lifecycle tests with injected clock, restart, malformed manifest, path escape,
    permissions, successful expiry, and partial-bundle retention.

### PM-104 - Implement Conflict Classification and Resolution Model

- **Description:** Classify Markdown, ordinary file, identical file, ignored, directory, and
  file/directory mismatch conflicts. Validate individual and bulk resolution choices.
- **Dependencies:** PM-102, PM-103.
- **Acceptance Criteria:**
  - [ ] Every conflict starts unresolved except identical non-Markdown auto-resolution.
  - [ ] Markdown supports Use source, Use destination, and Combine.
  - [ ] Files support Keep destination, Use source, and Keep both with explicit safe filename.
  - [ ] Ignored files expose paths and choices without content preview.
  - [ ] Type mismatches expose entry type, nested count, and size and require individual choice.
  - [ ] Bulk source/destination choices exclude directories and type mismatches and require explicit
        confirmation metadata.
  - [ ] Unresolved or invalid resolution blocks preparation.
- **Validation / Verification:**
  - _How to verify:_ Add table-driven tests for every entry pairing, resolution, invalid filename,
    case-fold collision, identical bytes, ignored content, and bulk-action exclusion.

### PM-105 - Implement Final Markdown Merge Validation

- **Description:** Produce staged Markdown from rewritten source, unchanged destination, and user
  result. Reuse canonical parser to validate final task metadata without imposing arbitrary Markdown
  syntax rules.
- **Dependencies:** PM-104.
- **Acceptance Criteria:**
  - [ ] Source preview already contains destination project tokens.
  - [ ] Combine default is destination, separator, then source.
  - [ ] Duplicate tasks and prose remain unless user edits them.
  - [ ] Git conflict markers are never inserted automatically.
  - [ ] Remaining source project tokens block preparation.
  - [ ] Invalid root/child project metadata blocks preparation.
  - [ ] Ordinary permissive Markdown is accepted with warnings where applicable.
- **Validation / Verification:**
  - _How to verify:_ Add parser/serializer tests for line endings, missing final newline, Unicode,
    nested tasks, code fences, links, duplicates, source-token residue, and invalid child metadata.

## Phase 2: Core Workflows

### PM-201 - Implement Cancellable Merge Preparation Service

- **Description:** Add serialized native service that resolves choices, builds complete staged result,
  reports bounded progress, and guarantees clean cancellation before commit.
- **Dependencies:** PM-103, PM-104, PM-105.
- **Acceptance Criteria:**
  - [ ] Preparation performs no user-file mutation.
  - [ ] Cancellation removes staging and leaves vault project data byte-identical.
  - [ ] Progress covers discovery, conflict resolution readiness, validation, and staging.
  - [ ] No keystroke triggers filesystem scan.
  - [ ] Resolver choices stay in memory while flow remains open.
  - [ ] Closing or restarting discards choices and invalidates plan token.
  - [ ] Busy mutation returns structured error without silently queuing plan.
- **Validation / Verification:**
  - _How to verify:_ Add cancellation injection at every preparation stage, mutation-lock contention,
    bounded-plan-store, restart, and byte-for-byte vault tests.

### PM-202 - Implement Guarded Merge Commit and Safe Stop

- **Description:** Commit prepared plan under shared mutation lock. Revalidate all sources, move
  displaced originals into recovery, install staged outputs atomically per file, remove source last,
  and reconcile index.
- **Dependencies:** PM-201.
- **Acceptance Criteria:**
  - [ ] Final commit requires immutable native prepared-plan token.
  - [ ] Every source and destination fingerprint revalidates before first mutation.
  - [ ] Stale plan changes no project data and retains manual result for review.
  - [ ] Displaced originals reach recovery before replacement.
  - [ ] Destination files and directories become durable before source removal.
  - [ ] Stop request is checked between atomic operations; current operation completes.
  - [ ] Stop or failure after mutation returns completed/pending work and protected recovery bundle.
  - [ ] No automatic rollback occurs.
  - [ ] Final paths are reindexed and old paths removed from SQLite before success.
- **Validation / Verification:**
  - _How to verify:_ Add injected stop/failure at every mutation boundary, stale external edit, recovery
    ordering, source-last, restart reconciliation, and index-failure tests.

### PM-203 - Add Recovery Management Service

- **Description:** Expose safe list, open, delete, and startup cleanup behavior for recovery bundles.
- **Dependencies:** PM-103, PM-202.
- **Acceptance Criteria:**
  - [ ] Listing returns operation ID, date, summary, size, status, and expiry without note contents.
  - [ ] Open action resolves existing recovery directory beneath vault.
  - [ ] Delete requires exact operation ID and rejects path escape or symlink replacement.
  - [ ] Successful bundle cleanup occurs only after 30 full days.
  - [ ] Partial/stopped bundles remain until explicit confirmed deletion.
  - [ ] Cleanup failure preserves bundle and emits sanitized diagnostic.
- **Validation / Verification:**
  - _How to verify:_ Add injected-clock and adversarial filesystem tests; verify startup cleanup and
    manual delete never touch unrelated `.octarine` paths.

### PM-204 - Generate Typed Merge IPC

- **Description:** Export merge plan, conflicts, resolutions, progress, result, cancellation,
  recovery, and error DTOs from Rust and add runtime-guarded frontend adapters.
- **Dependencies:** PM-201, PM-202, PM-203.
- **Acceptance Criteria:**
  - [ ] Generated DTOs cover every project-definition contract.
  - [ ] Client supplies project names, plan token, conflict ID, and resolution only—not trusted paths
        or operation ordering.
  - [ ] Runtime guards reject malformed native responses.
  - [ ] Structured errors cover ancestry, symlink, unresolved conflict, invalid result, stale plan,
        busy, cancelled, operation failure, partial failure, and recovery failure.
  - [ ] Cancellation command uses operation ID and is idempotent.
- **Validation / Verification:**
  - _How to verify:_ Run adapter tests plus `npm run ipc:check`; inspect generated diff.

### PM-205 - Build Merge UI in Storybook

- **Description:** Build shared collision offer, merge summary, resolver, progress, commit boundary,
  safe-stop, recovery, and settings recovery-list components. Do not integrate into app before exact
  Storybook approval.
- **Dependencies:** PM-204.
- **Acceptance Criteria:**
  - [ ] Rename collision offers Merge projects instead of disabled Rename project.
  - [ ] Hard blockers distinguish ancestry and symlink cases.
  - [ ] Conflict list is virtualized and keyboard reachable.
  - [ ] Markdown resolver shows source, destination, and editable result.
  - [ ] Ignored conflicts never render content.
  - [ ] Bulk action displays affected count and requires confirmation.
  - [ ] Preparation Cancel and commit Stop safely use distinct language.
  - [ ] Recovery state shows completed, pending, inspect paths, and actions.
  - [ ] Desktop and narrow states fit viewport without hidden primary actions.
  - [ ] Named stories reach exact user approval.
- **Validation / Verification:**
  - _How to verify:_ Render and inspect merge-offer, clean-plan, unresolved, Markdown, file,
    type-mismatch, bulk-confirmation, preparing, cancelled, commit-boundary, committing, stopping,
    partial-recovery, success, recovery-settings, and narrow stories.

### PM-206 - Integrate Approved Merge Workflow

- **Description:** Wire approved components to collision path, native preparation/execution,
  cancellation, navigation, notifications, and recovery settings.
- **Dependencies:** PM-205 exact approval.
- **Acceptance Criteria:**
  - [ ] Merge entry appears only for mergeable identity/storage collisions.
  - [ ] Conflict choices survive busy/stale errors while flow remains open.
  - [ ] Clean Cancel closes flow without vault changes.
  - [ ] Final Commit displays irreversible-boundary explanation.
  - [ ] Stop safely remains available during commit.
  - [ ] Success follows source/descendant selection to destination; unrelated view remains selected.
  - [ ] Success notification offers Open destination and Open recovery with deletion date.
  - [ ] Partial state remains open with Retry preflight and recovery access.
  - [ ] Rendered macOS app reaches `APP VERIFIED`.
- **Validation / Verification:**
  - _How to verify:_ Use deterministic visual fixtures plus temporary native vault; inspect desktop and
    narrow app states after Storybook approval.

## Phase 3: Integration, Security, Performance, and Polish

### PM-301 - Harden Merge Filesystem and Privacy Boundaries

- **Description:** Audit every merge command against canonical-root, hidden workspace, ignore,
  symlink, collision, stale-source, diagnostic, and manifest-redaction requirements.
- **Dependencies:** PM-206.
- **Acceptance Criteria:**
  - [ ] Frontend paths and resolution names are never trusted directly.
  - [ ] Staging/recovery roots cannot escape vault or be replaced by symlink.
  - [ ] Ignored content is never read for preview, parsing, hashing content, or diagnostics.
  - [ ] Recoverable runtime paths contain no new `unwrap`, `expect`, or `panic!`.
  - [ ] Diagnostics contain no task text, metadata values, merge results, or full external paths.
  - [ ] Recovery deletion cannot target vault root, `.octarine` root, staging, or unrelated bundle.
- **Validation / Verification:**
  - _How to verify:_ Run adversarial path/symlink/race tests, inspect error mapping and diagnostics,
    then run Clippy with warnings denied.

### PM-302 - Measure Large-vault Merge Performance

- **Description:** Add reproducible release benchmark at accepted 20,000-file/2,000,000-task scale.
  Measure discovery, preparation, staging, commit, recovery bookkeeping, and reindex separately.
- **Dependencies:** PM-202, PM-301.
- **Acceptance Criteria:**
  - [ ] Fixture generator records total and affected files/tasks, conflict types, largest file, and
        ordinary/ignored entry counts.
  - [ ] Results record machine, filesystem, build profile, run count, p50/p95 where repeated, and each
        phase duration.
  - [ ] UI work stays off rendering thread and progress remains responsive.
  - [ ] Resolver list mounts bounded rows for large conflict count.
  - [ ] Profiling identifies measured hotspots before optimization.
  - [ ] No task-creation path regresses into full-vault scan.
- **Validation / Verification:**
  - _How to verify:_ Run documented release benchmark on macOS local SSD and retain result summary.

### PM-303 - Complete Merge Documentation

- **Description:** Update owning ADR, project-name and filesystem specifications, architecture,
  design guide after approval, roadmap, recovery settings, user guide, and troubleshooting.
- **Dependencies:** PM-206, PM-301, PM-302.
- **Acceptance Criteria:**
  - [ ] Documentation distinguishes rename, merge, dry run, commit, Stop safely, and recovery.
  - [ ] Conflict choices and Markdown merge behavior include concrete examples.
  - [ ] Ignore, symlink, link, ancestor, stale-plan, and duplicate-content rules are explicit.
  - [ ] Recovery location, privacy, manual deletion, partial retention, and 30-day cleanup are explicit.
  - [ ] Design guide records only approved reusable visual conventions.
  - [ ] Roadmap states actual implementation status without Linux/Windows claim.
- **Validation / Verification:**
  - _How to verify:_ Run Prettier check, verify local links, and compare every behavioral statement
    against tests and implementation.

### PM-304 - Run Full Project Merge Release Gate

- **Description:** Verify complete merge workflow on temporary macOS vault, run every automated gate,
  and audit final diff.
- **Dependencies:** PM-301, PM-302, PM-303.
- **Acceptance Criteria:**
  - [ ] Manual macOS smoke covers leaf, hierarchy, recursive descendant, Markdown, ordinary, ignored,
        identical, type-mismatch, clean cancellation, stale edit, safe stop, recovery, and cleanup.
  - [ ] Approved Storybook and rendered app states match.
  - [ ] Component, IPC, visual, Rust, documentation, and benchmark gates pass.
  - [ ] No unrelated user changes or `.agents` pointer enter merge diff.
  - [ ] Linux and Windows remain explicitly unverified.
- **Validation / Verification:**
  - _How to verify:_ Run `npm run ipc:check`, `npm run format:check`, `npm run lint`, `npm run build`,
    frontend tests, approved visual tests, `cargo fmt --all -- --check`,
    `cargo clippy --all-targets -- -D warnings`, `cargo test --all-targets`, release benchmark, rendered
    macOS smoke, and `git diff --check`.
