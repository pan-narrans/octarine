# Actionable Implementation Backlog: Task Creation and Project Organization

Source: `TASK_CREATION_PROJECT_DEFINITION.md`

Sequence matters. Complete Block 1 before Block 2. Visual work follows mandatory
`Storybook implementation → exact approval → app integration` gate. Commits, branches, pull requests,
and external actions remain outside backlog authorization.

## Phase 1: Foundation and Data Model

### TC-101 - Record Unified Vault and Routing Architecture

- **Description:** Add ADR for one canonical vault, relative organizational paths, task routing,
  ignore scope, migration safety, and Markdown/SQLite authority. Record Block 2 multi-file rename as
  later decision boundary, not implemented behavior.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - [x] ADR states one canonical vault contains notes, journals, projects, and inbox.
  - [x] ADR states passive indexing never relocates Markdown.
  - [x] ADR states external journals are never moved automatically.
  - [x] ADR defines relative destination paths, path confinement, hidden-directory exclusion,
        directory-symlink exclusion, and `.octarineignore` scope.
  - [x] ADR distinguishes atomic per-file writes from non-atomic multi-file workflows.
- **Validation / Verification:**
  - _How to verify:_ Inspect ADR links and decisions; run
    `./node_modules/.bin/prettier --check docs/adr/<new-adr>.md`.

### TC-102 - Implement Configuration Version 2

- **Description:** Replace independent journal capability with relative journal, project, inbox,
  default-destination, template, and insertion configuration beneath one vault root. Keep DTO and
  validation Rust-owned.
- **Dependencies:** TC-101.
- **Acceptance Criteria:**
  - [x] `AppConfig` version increments to 2 with fields defined by approved project definition.
  - [x] Defaults resolve to `journals/`, `projects/`, and `inbox.md` under vault.
  - [x] Inbox, Daily note, and Projects each own template and insertion settings.
  - [x] Heading and marker modes require non-empty targets; EOF rejects target value.
  - [x] Unknown fields and unsupported versions remain rejected.
  - [x] Configuration save remains atomic.
- **Validation / Verification:**
  - _How to verify:_ Add Rust unit tests for valid defaults and every invalid field combination; run
    `cd src-tauri && cargo test config --all-targets`.

### TC-103 - Implement Non-Destructive Version 1 Migration

- **Description:** Migrate existing configuration without moving journal content. Convert journal path
  inside vault to relative path. Preserve external path only as recovery metadata and mark journal
  setup incomplete.
- **Dependencies:** TC-102.
- **Acceptance Criteria:**
  - [x] Internal journal path converts to normalized relative folder.
  - [x] External journal files and directories remain byte-for-byte untouched.
  - [x] External journal produces typed migration-required state while rest of app can start.
  - [x] Previous configuration is retained in documented backup location.
  - [x] Repeated startup after successful migration is idempotent.
  - [x] Tests never access real home, vault, config, or cache paths.
- **Validation / Verification:**
  - _How to verify:_ Add table-driven migration tests using unique temporary roots; run
    `cd src-tauri && cargo test config --all-targets`.

### TC-104 - Unify Runtime Filesystem Capability

- **Description:** Make vault root sole runtime capability. Resolve journal, inbox, project, and note
  operations through constrained relative paths. Remove independent journal-root authorization after
  migration support no longer needs it.
- **Dependencies:** TC-102, TC-103.
- **Acceptance Criteria:**
  - [ ] Application state owns one canonical vault root.
  - [ ] Journal and project paths resolve beneath canonical vault root.
  - [ ] Absolute paths, traversal, empty segments, and symlink escape fail with structured errors.
  - [ ] Journal tree keeps date-file filtering while reading configured relative folder.
  - [ ] Runtime environment overrides have documented version-2 behavior.
- **Validation / Verification:**
  - _How to verify:_ Add filesystem-boundary integration tests for accepted and rejected roots; run
    `cd src-tauri && cargo test --all-targets`.

### TC-105 - Add `.octarineignore` Domain and Traversal Rules

- **Description:** Parse vault-root `.octarineignore` with Gitignore-style semantics. Apply rules to
  task indexing and watcher intake while keeping matching Markdown visible in note navigation.
- **Dependencies:** TC-104.
- **Acceptance Criteria:**
  - [ ] Root ignore file supports documented anchored, directory, wildcard, negation, and comment
        rules.
  - [ ] Hidden directories are skipped by task scanner and watcher.
  - [ ] Directory symlinks are never traversed.
  - [ ] Matching Markdown remains present in note tree and remains editable.
  - [ ] Configured write destinations matching ignore rules fail settings validation.
  - [ ] Ignore parser failure produces sanitized structured error without exposing note content.
- **Validation / Verification:**
  - _How to verify:_ Add temporary-vault tests for each rule form, hidden paths, symlink loops, visible
    tree behavior, and ignored destination rejection; run `cd src-tauri && cargo test --all-targets`.

### TC-106 - Reconcile Index and Watcher After Ignore Changes

- **Description:** Detect `.octarineignore` changes, rebuild affected derived index state, and prevent
  watcher/direct-index duplicate frontend updates. Keep UI responsive during reconciliation.
- **Dependencies:** TC-105.
- **Acceptance Criteria:**
  - [ ] Creating, editing, or deleting ignore file triggers observable bounded reconciliation.
  - [ ] Newly ignored task rows disappear from SQLite.
  - [ ] Newly included task rows appear without application restart.
  - [ ] Reconciliation never deletes or edits Markdown.
  - [ ] Direct write plus watcher event yields one logical frontend task state.
  - [ ] No fixed sleeps appear in timing-sensitive tests.
- **Validation / Verification:**
  - _How to verify:_ Add watcher/index integration tests using observable conditions and timeouts; run
    `cd src-tauri && cargo test --all-targets`.

### TC-107 - Implement Project Name and Destination Domain

- **Description:** Add canonical project validator, NFC normalization, case-fold collision checks,
  hierarchy mapping, and destination resolver shared by preview, create, move, and later rename.
- **Dependencies:** TC-104, TC-105.
- **Acceptance Criteria:**
  - [x] Segments accept Unicode letters, numbers, `_`, and `-` only.
  - [x] Leading/trailing slash, empty segment, dot, spaces, traversal, and absolute paths fail.
  - [x] Display capitalization is preserved while uniqueness is case-insensitive.
  - [x] `work/project1` maps to `<project-folder>/work/project1.md`.
  - [x] Existing case-fold conflicts remain readable but block create and move.
  - [x] Resolver proves final parent and file remain beneath vault and outside ignored paths.
- **Validation / Verification:**
  - _How to verify:_ Add table-driven Unicode, case, hierarchy, traversal, and collision tests; run
    `cd src-tauri && cargo test project --all-targets` or nearest module-specific test target.

### TC-108 - Implement Destination Template Engine

- **Description:** Validate and render inline templates for Inbox, Daily note, and Projects. Keep
  template source in application configuration, not vault Markdown.
- **Dependencies:** TC-102, TC-107.
- **Acceptance Criteria:**
  - [x] Engine supports `{{project}}`, `{{project_name}}`, `{{date}}`, and `{{datetime}}`.
  - [x] Unknown or malformed placeholders fail settings validation.
  - [x] Date/time uses injected local submission clock for deterministic tests.
  - [x] Project-only placeholders fail when used for unprojected destination.
  - [x] Rendering never interprets arbitrary code or accesses filesystem.
  - [x] Existing destination file is never re-rendered from changed template.
- **Validation / Verification:**
  - _How to verify:_ Add deterministic unit tests for each placeholder, timezone boundary, escaping,
    malformed input, and existing-file behavior; run `cd src-tauri && cargo test template --all-targets`.

### TC-109 - Add Rust-Owned Task Draft Contracts

- **Description:** Define normalized draft, capture context, preview, warning, receipt, and structured
  error DTOs in Rust. Generate TypeScript types. Keep frontend free from independent metadata parser.
- **Dependencies:** TC-107, TC-108.
- **Acceptance Criteria:**
  - [x] Compact input parses current canonical inline metadata syntax.
  - [x] Parser rejects multiline compact input, leading checklist marker, empty title, invalid values,
        and multiple projects.
  - [x] Inherited project pre-fills draft; explicit typed project replaces it.
  - [x] Inherited contexts/tags merge and deduplicate with typed values.
  - [x] `s:` classifies preview as Event without adding structured scheduling fields.
  - [x] Child draft inherits parent project and rejects conflicting child project.
  - [x] Generated TypeScript contracts pass drift check.
- **Validation / Verification:**
  - _How to verify:_ Add parser/serializer round-trip and generated-contract tests; run
    `npm run ipc:generate`, `npm run ipc:check`, and `cd src-tauri && cargo test parser --all-targets`.

### TC-110 - Establish Performance Fixture and Benchmark Harness

- **Description:** Add reproducible generated-vault fixtures and benchmarks before optimizing. Record
  machine, filesystem, build profile, fixture shape, warmup, and run count.
- **Dependencies:** TC-105, TC-109.
- **Acceptance Criteria:**
  - [ ] Fixture can generate 20,000 Markdown files and 200,000 indexed tasks without real user paths.
  - [ ] Fixture includes 2 MB typical and 20 MB maximum destination files.
  - [ ] Benchmarks measure draft preview, insertion, direct reindex, and end-to-end create service.
  - [ ] Benchmark artifacts stay outside tracked source unless explicitly intended.
  - [ ] Harness supports repeatable macOS release-profile runs.
- **Validation / Verification:**
  - _How to verify:_ Run documented benchmark smoke size, then one accepted-scale baseline on macOS;
    record command and machine metadata without publishing pass claims yet.

## Phase 2: Core Creation Workflows

### TC-201 - Implement Guarded Task Insertion Writer

- **Description:** Add domain writer for new/existing destination files and heading, marker, or EOF
  insertion. Preserve source formatting and return precise insertion result.
- **Dependencies:** TC-108, TC-109.
- **Acceptance Criteria:**
  - [x] Missing parent directories and file are created only after path and template validation.
  - [x] New file renders selected destination template before task insertion.
  - [x] Unique heading/marker inserts newest task directly below target.
  - [x] Missing or duplicate target falls back EOF with stable warning code.
  - [x] EOF mode appends and returns stable informational code.
  - [x] Existing task order is not actively rewritten.
  - [x] Existing line endings, permissions, and unrelated bytes are preserved where platform permits.
  - [x] Double submission using same operation ID cannot create duplicate block.
- **Validation / Verification:**
  - _How to verify:_ Add writer tests for every new/existing file and insertion combination, CRLF/LF,
    permissions, duplicate request, and byte preservation; run
    `cd src-tauri && cargo test writer --all-targets`.

### TC-202 - Add Concurrent Edit Retry and Safe Failure

- **Description:** Guard destination snapshot before replacement. Retry once by rereading and
  reinserting after external change. Abort second conflict without overwriting newer content.
- **Dependencies:** TC-201.
- **Acceptance Criteria:**
  - [x] First detected destination change performs exactly one full re-resolution attempt.
  - [x] Second detected change returns structured conflict.
  - [x] External content survives both retry and failure scenarios.
  - [x] New-file collision with externally created file re-enters existing-file path safely.
  - [x] Tests coordinate mutations through hooks/observable barriers, not sleeps.
- **Validation / Verification:**
  - _How to verify:_ Add deterministic concurrent writer integration tests; run
    `cd src-tauri && cargo test --all-targets`.

### TC-203 - Implement Create Task Service and IPC Command

- **Description:** Build thin Tauri command over service that revalidates draft, resolves destination,
  inserts task, directly reindexes one file, and returns task, path, warning, and Undo receipt.
- **Dependencies:** TC-106, TC-201, TC-202.
- **Acceptance Criteria:**
  - [x] Frontend-provided destination preview is never trusted as write authority.
  - [x] Project task contains exactly one explicit canonical `+project` token.
  - [x] Unprojected task routes to configured Daily note or Inbox.
  - [x] Success occurs only after target file direct reindex succeeds.
  - [x] Failure never leaves SQLite ahead of Markdown.
  - [x] Returned indexed task matches created root task and includes source path/line.
  - [x] Diagnostics use stable codes and redact task text, metadata, and full paths.
- **Validation / Verification:**
  - _How to verify:_ Add black-box service/IPC tests using temporary config, vault, and database; run
    `cd src-tauri && cargo test --all-targets` and `npm run ipc:check`.

### TC-204 - Implement Conflict-Safe Creation Undo

- **Description:** Delete exact created Markdown subtree using guarded receipt. Never delete an
  uncertain nearby block.
- **Dependencies:** TC-203.
- **Acceptance Criteria:**
  - [x] Undo removes root notes and every nested subtask created in same operation.
  - [x] Exact location succeeds after no external change.
  - [x] Safe nearby recovery succeeds after unambiguous line shift.
  - [x] Missing, changed, or ambiguous source fails with structured error.
  - [x] Undo reindexes target file before success response.
  - [x] Undo remains safe when destination file contains duplicate task text.
- **Validation / Verification:**
  - _How to verify:_ Add writer and integration tests for success, line shift, mutation, deletion,
    ambiguity, duplicate content, and reindex; run `cd src-tauri && cargo test --all-targets`.

### TC-205 - Implement Confirmed Task-Subtree Project Move

- **Description:** Add guarded cross-file service that moves existing root task, notes, and nested
  subtasks to destination resolved from new project. Keep UI confirmation outside native domain, but
  require explicit move operation rather than raw metadata replacement.
- **Dependencies:** TC-107, TC-201, TC-202.
- **Acceptance Criteria:**
  - [x] Root project change moves complete raw Markdown subtree.
  - [x] Child effective project inherits new parent project.
  - [x] Destination follows project template/insertion rules when new.
  - [x] Source stale/missing/ambiguous state aborts before source removal.
  - [x] Destination failure leaves source intact.
  - [x] Source-removal failure after destination insertion triggers rollback attempt and returns
        explicit recovery state if rollback fails.
  - [x] Removing project routes subtree to configured unprojected destination.
  - [x] Both affected files reindex before success.
- **Validation / Verification:**
  - _How to verify:_ Add cross-file integration matrix covering existing/missing destination,
    descendants, notes, unprojected route, source conflict, destination failure, rollback success, and
    partial failure; run `cd src-tauri && cargo test --all-targets`.

### TC-206 - Add Typed Frontend IPC and Creation State

- **Description:** Add feature-owned adapters and bounded Zustand state/actions for preview, create,
  Undo, and subtree move. Prevent duplicate submissions and reconcile returned native task directly.
- **Dependencies:** TC-109, TC-203, TC-204, TC-205.
- **Acceptance Criteria:**
  - [x] Raw `invoke` calls stay inside typed task IPC adapter.
  - [x] Runtime validation narrows untrusted IPC results.
  - [x] Repeated Create while request is pending performs one native call.
  - [x] Returned task appears once before watcher refresh.
  - [x] Structured warning and error codes drive UI branches.
  - [ ] Store refreshes affected state after conflict without hiding failure.
- **Validation / Verification:**
  - _How to verify:_ Add Vitest tests mocking typed IPC boundary; run targeted frontend tests plus
    `npm run ipc:check`, `npm run format:check`, `npm run lint`, and `npm run build`.

### TC-207 - Refactor Shared `TaskComposer`

- **Description:** Extract reusable controlled composer from existing `EditTaskModal`. Separate form
  presentation/draft behavior from persistence policy. Correct project and deletion invariants during
  extraction without unrelated restyling.
- **Dependencies:** TC-109, TC-206.
- **Acceptance Criteria:**
  - [ ] `TaskComposer` owns fields, raw/preview panel, subtasks, metadata, validation display, and
        accessible focus behavior.
  - [ ] `CreateTaskModal` and `EditTaskModal` remain separate wrappers.
  - [ ] Create mode has no Delete action and cannot interpret empty source as deletion.
  - [ ] Edit mode retains explicit Delete and guarded original source identity.
  - [ ] Existing task-modal approved visual states remain unchanged unless separately approved.
  - [ ] Child structured UI cannot assign conflicting project.
  - [ ] Project change on saved root invokes confirmation before move operation.
- **Validation / Verification:**
  - _How to verify:_ Run component/unit tests for both wrappers, existing task-modal visual suite, and
    frontend quality gates. Inspect rendered existing edit stories for regressions.

### TC-208 - Build Quick Capture in Storybook

- **Description:** Implement real shared compact capture component and named stories before app
  integration. Use existing design tokens and controls. Do not update approved snapshots before exact
  user approval.
- **Dependencies:** TC-206, TC-207.
- **Acceptance Criteria:**
  - [ ] Compact component contains single-line task input, visible inherited chips, destination
        preview, Create, and Expand controls.
  - [ ] Stories cover default, inherited project/context/tag, typed project replacement, invalid
        metadata, Event preview, submitting, closed-modal success, EOF info, missing target,
        duplicate target, write error with retained modal, index-refresh partial success,
        notification stack, and narrow viewport.
  - [ ] Keyboard behavior covers Enter submit, Escape close, focus trap/return, and accessible labels.
  - [ ] Rendered states meet explicit visual criteria derived from approved definition.
  - [ ] Status reaches `STORYBOOK REVIEW` and pauses for exact approval.
- **Validation / Verification:**
  - _How to verify:_ Run Storybook, inspect every named viewport in in-app browser, run relevant
    component tests, and record visual status. Run `npm run visual:update` only after approval, then
    `npm run visual:test`.

### TC-209 - Build Expanded Creation Flow in Storybook

- **Description:** Compose compact capture with `CreateTaskModal` expansion using same normalized
  draft. Preserve typed text and inherited data across expansion.
- **Dependencies:** TC-207, TC-208.
- **Acceptance Criteria:**
  - [ ] Expand preserves title, parsed metadata, inherited values, and destination.
  - [ ] Structured edits update native-backed preview without independent TypeScript parsing.
  - [ ] Raw mode accepts exactly one root task and shows field-level validation.
  - [ ] Raw `s:` visibly changes classification to Event.
  - [ ] Subtask UI supports title/description; advanced child metadata remains raw-only.
  - [ ] Stories cover all material create states and existing Edit wrapper regression states.
  - [ ] Status reaches `STORYBOOK REVIEW` and pauses for exact approval.
- **Validation / Verification:**
  - _How to verify:_ Inspect named Storybook states and viewports, run component tests, obtain exact
    approval, update intended baselines, then run `npm run visual:test`.

### TC-210 - Build Task-Creation Settings in Storybook

**Status:** STORYBOOK APPROVED

- **Description:** Add shared settings surface for default destination, relative paths, templates,
  insertion modes, targets, validation, and migration status. Implement stories before app wiring.
- **Dependencies:** TC-102, TC-108, TC-206.
- **Acceptance Criteria:**
  - [x] Inbox, Daily note, and Projects settings remain independently editable.
  - [x] Heading/marker target fields appear only for matching mode.
  - [x] Template placeholders and validation are understandable without external knowledge.
  - [x] Invalid ignored/out-of-vault destination cannot save.
  - [x] Stories cover valid, invalid, migration-required, saving, saved, and narrow states.
  - [x] Status reaches `STORYBOOK REVIEW` and pauses for exact approval.
- **Validation / Verification:**
  - _How to verify:_ Run component tests and inspect every named Storybook state. After exact approval,
    update intentional snapshots and run `npm run visual:test`.

### TC-211 - Integrate Approved Capture into Application

- **Description:** After TC-208 and TC-209 receive exact Storybook approval, add global header action
  and feature-owned orchestration without expanding `App.tsx` with substantial logic.
- **Dependencies:** TC-208, TC-209 and recorded `STORYBOOK APPROVED` state.
- **Acceptance Criteria:**
  - [x] Global `New task` action appears on dashboard, task lists, project views, note editor, and
        other main surfaces.
  - [x] Project/context/tag simple views provide correct capture context.
  - [x] Todo, Doing, custom-query, note, dashboard, and calendar surfaces add no implicit metadata.
  - [x] Dashboard and all unprojected captures use configured default destination.
  - [x] Existing task filtering and navigation remain unchanged.
  - [x] Rendered app matches approved Storybook component in surrounding layouts.
  - [x] Status reaches `APP VERIFIED` before completion.
- **Validation / Verification:**
  - _How to verify:_ Use deterministic visual fixtures for each context, inspect rendered app at
    desktop and narrow widths, run frontend tests and `npm run visual:test`.

### TC-212 - Integrate Approved Settings and Migration Banner

**Status:** APP VERIFIED

- **Description:** After TC-210 approval, wire settings to version-2 native validation/save and expose
  non-blocking migration banner for external journal configuration.
- **Dependencies:** TC-103, TC-210 and recorded `STORYBOOK APPROVED` state.
- **Acceptance Criteria:**
  - [x] Saved settings round-trip through typed native config.
  - [x] External journal state disables journal section only.
  - [x] Persistent banner explains files were not moved and requests folder inside vault.
  - [x] User can select/confirm internal folder without deleting external source.
  - [x] Capture uses new settings immediately after successful save.
  - [x] Rendered app integration reaches `APP VERIFIED`.
- **Validation / Verification:**
  - _How to verify:_ Run temporary-config integration test, component tests, rendered app inspection,
    frontend gates, and affected visual tests.

### TC-213 - Add Creation Result, Open, and Undo Feedback

- **Description:** Present success or fallback information using structured native result. Add Open
  file and bounded Undo action without relying on alert text.
- **Dependencies:** TC-204, TC-211.
- **Acceptance Criteria:**
  - [x] Normal success names destination and exposes Open and Undo.
  - [x] Missing/duplicate target message states EOF fallback reason.
  - [x] Explicit EOF message states task was appended at file end.
  - [x] Open selects destination file in Octarine editor.
  - [x] Undo success reconciles state; conflict leaves task untouched and reports safe failure.
  - [x] Feedback is keyboard reachable and announced accessibly.
- **Validation / Verification:**
  - _How to verify:_ Add component/state tests for every result branch, Storybook states if visual
    pattern changes, rendered app inspection, and targeted native integration test.

## Phase 3: Integration, Security, Performance, and Polish

### TC-301 - Harden End-to-End Filesystem Safety

- **Description:** Audit every new command and service against canonical-root, ignore, symlink,
  collision, stale-source, partial-failure, and diagnostic-redaction requirements.
- **Dependencies:** TC-203, TC-204, TC-205, TC-212.
- **Acceptance Criteria:**
  - [ ] No frontend path or preview is trusted without Rust resolution.
  - [ ] Symlinked parent/file escape is rejected before mutation.
  - [ ] Ignored destination is rejected before file creation.
  - [ ] Recoverable runtime paths contain no new `unwrap`, `expect`, or `panic!`.
  - [ ] Structured IPC errors cover every approved failure class.
  - [ ] Diagnostics contain no task text, metadata values, templates, or full paths.
- **Validation / Verification:**
  - _How to verify:_ Run adversarial path/insertion/move tests, inspect error mapping and diagnostics,
    then run Clippy with warnings denied.

### TC-302 - Meet Accepted Performance Budgets

- **Description:** Measure release-profile behavior at approved doubled scale, optimize only measured
  hotspots, and prevent full-vault work on task creation.
- **Dependencies:** TC-110, TC-203, TC-211.
- **Acceptance Criteria:**
  - [ ] Quick capture opens under 50 ms on documented macOS machine.
  - [ ] Input update remains under 16 ms.
  - [ ] Destination preview completes under 50 ms.
  - [ ] Typical task creation completes under 200 ms p95.
  - [ ] Creation in 20 MB file completes under 500 ms p95.
  - [ ] Incremental reindex of 2 MB file completes under 250 ms p95.
  - [ ] Create path reindexes one file and performs no full vault scan.
  - [ ] UI remains usable during startup and ignore reconciliation.
- **Validation / Verification:**
  - _How to verify:_ Run documented release-profile benchmark suite on recorded macOS hardware at
    20,000 files/200,000 tasks; retain summary with p50/p95 and environment metadata.

### TC-303 - Complete Creation Documentation

- **Description:** Update owning specifications, architecture, roadmap, design documentation, and user
  guide. Document template language as required product behavior.
- **Dependencies:** TC-212, TC-213, TC-301, TC-302.
- **Acceptance Criteria:**
  - [ ] Configuration specification documents version 2 and migration.
  - [ ] Template specification documents placeholders, validation, insertion, and fallback examples.
  - [ ] `.octarineignore` specification documents syntax, scope, reload, and visible-note behavior.
  - [ ] Task syntax documents compact-input boundary and child project inheritance.
  - [ ] Filesystem boundary documents unified vault and cross-file safety.
  - [ ] Architecture describes implemented services, direct reindex, watcher deduplication, and Undo.
  - [ ] Design guide records only approved reusable visual conventions.
  - [ ] Roadmap marks actual implementation status without claiming Linux/Windows support.
- **Validation / Verification:**
  - _How to verify:_ Check local links and commands, run Prettier check on changed Markdown, and compare
    every behavioral statement against tests and implementation.

### TC-304 - Run Full Creation Release Gate

- **Description:** Verify Block 1 as one integrated macOS workflow using temporary vault/config/cache,
  then run every prescribed automated gate and review final diff.
- **Dependencies:** TC-301, TC-302, TC-303.
- **Acceptance Criteria:**
  - [ ] Manual macOS smoke covers project capture, inherited metadata, Daily note, Inbox, new file,
        existing file, each insertion mode, warning fallback, Open, Undo, external edit retry, repeated
        conflict, subtree move, ignore change, and configuration migration.
  - [ ] Storybook state is `APP VERIFIED` for capture and settings.
  - [ ] Performance report passes every accepted budget.
  - [ ] No test touches real user data.
  - [ ] Final diff contains no unrelated changes.
  - [ ] Remaining Linux/Windows and Block 2 work is reported explicitly.
- **Validation / Verification:**
  - _How to verify:_ Run:

    ```bash
    npm run ipc:check
    npm run format:check
    npm run lint
    npm run build
    npm run visual:test
    cd src-tauri
    cargo fmt --all -- --check
    cargo clippy --all-targets -- -D warnings
    cargo test --all-targets
    ```

## Phase 4: Block 2 — Hierarchical Project Rename

### PR-401 - Record Guarded Project Rename Decision

- **Description:** Add ADR describing project identity, exact/descendant rewrite scope, file/directory
  mapping, ignored-content behavior, link non-rewrite, preflight, partial failure, recovery, and
  case-only rename.
- **Dependencies:** TC-304.
- **Acceptance Criteria:**
  - [x] `work → job` maps both `work.md` and `work/` plus descendant project tokens.
  - [x] Ordinary files inside renamed directory move with directory.
  - [x] Ignored file contents remain untouched even when containing old project token.
  - [x] Markdown links remain unchanged.
  - [x] Per-file atomicity and lack of global atomicity are explicit.
  - [x] Recovery state requirements are normative.
- **Validation / Verification:**
  - _How to verify:_ Review ADR against approved definition and format-check changed Markdown.

### PR-402 - Implement Rename Preflight Planner

- **Description:** Build pure planner that discovers affected non-ignored task sources, exact project
  file, descendant directory, destination paths, case-fold collisions, and source fingerprints without
  mutating filesystem.
- **Dependencies:** PR-401, TC-107.
- **Acceptance Criteria:**
  - [x] Planner handles leaf, parent hierarchy, and case-only rename.
  - [x] Exact token matching avoids rewriting prefix lookalikes.
  - [x] Descendant token suffixes remain unchanged after prefix replacement.
  - [x] Every destination collision appears before execution.
  - [x] Ignored contents are excluded from token rewrite plan.
  - [x] Plan is deterministic and serializable for confirmation UI.
- **Validation / Verification:**
  - _How to verify:_ Add table-driven planner tests for exact, descendant, lookalike, Unicode, case,
    ignored, collision, file-only, directory-only, and combined mappings; run targeted Rust tests.

### PR-403 - Implement Rename Executor and Recovery Report

- **Description:** Execute approved preflight plan with bounded locks, guarded source fingerprints,
  safe case-only temporary path, atomic per-file writes, directory/file rename ordering, index
  reconciliation, and explicit partial-failure report.
- **Dependencies:** PR-402.
- **Acceptance Criteria:**
  - [x] Executor refuses stale or mismatched plan before first mutation when detectable.
  - [x] Case-only rename succeeds on case-insensitive macOS filesystem.
  - [x] Exact and descendant task tokens update in non-ignored Markdown.
  - [x] Project file and descendant directory reach planned destinations.
  - [x] Ordinary directory contents move intact.
  - [x] Markdown links and ignored file contents remain byte-identical.
  - [x] Index reconciles every affected non-ignored file before success.
  - [x] Partial failure reports completed and pending operations plus recovery guidance.
- **Validation / Verification:**
  - _How to verify:_ Add temporary-vault integration tests with injected failures at each execution
    stage; run Rust tests, formatting, and Clippy.

### PR-404 - Add Typed Rename IPC and Confirmation UI

- **Description:** Expose preflight preview and execution through generated IPC. Build confirmation
  interface showing affected project paths, file/directory moves, task rewrite count, collision state,
  and non-updated links.
- **Dependencies:** PR-403.
- **Acceptance Criteria:**
  - [x] UI cannot execute without current native preflight token.
  - [x] Confirmation names source/destination and descendant impact clearly.
  - [x] Collision blocks confirmation.
  - [x] UI warns Markdown links are not updated.
  - [x] Partial failure view exposes recovery report without raw diagnostic leakage.
  - [x] Storybook stories reach exact approval before app integration.
  - [x] App integration reaches `APP VERIFIED`.
- **Validation / Verification:**
  - _How to verify:_ Run generated-contract checks, component tests, named Storybook review, approved
    visual regression, and rendered app inspection.

### PR-405 - Verify and Document Project Rename Block

- **Description:** Complete adversarial tests, macOS manual smoke, performance measurement, owning
  documentation, and final quality gate for Block 2.
- **Dependencies:** PR-404.
- **Acceptance Criteria:**
  - [x] Tests cover leaf, hierarchy, case-only, collisions, stale plan, ignored content, ordinary
        files, links, injected partial failure, recovery report, and restart reconciliation.
  - [x] Rename performance is measured against approved 20,000-file/200,000-task fixture.
  - [x] Documentation describes scope, confirmation, ignored content, links, and recovery.
  - [x] macOS smoke test verifies exact Markdown and filesystem result.
  - [x] No Linux or Windows support claim is added.
  - [ ] Full frontend, IPC, visual, Rust, and documentation gates pass.
- **Validation / Verification:**
  - _How to verify:_ Run full TC-304 command set plus rename benchmark and documented macOS smoke
    matrix; inspect final diff for unrelated changes.
