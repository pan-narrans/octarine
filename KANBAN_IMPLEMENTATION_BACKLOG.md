# Project Kanban Implementation Backlog

Source of truth for scope: [`PROJECT_DEFINITION.md`](PROJECT_DEFINITION.md).

## Delivery Map

| Phase                                | Outcome                                                                                                 | Exit gate                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1. Foundation and Data Model         | Markdown, parser, index, query, writer, and IPC understand Deferred and primary context.                | Rust tests pass; generated contracts clean; disposable index rebuild verified.      |
| 2. Core Workflows                    | Approved Kanban component integrates with project navigation, filters, editor, and safe drag mutations. | Storybook approved first; same component then verified in app.                      |
| 3. Integration, Security, and Polish | Large groups, conflicts, responsive behavior, documentation, and full regression gates verified.        | Complete frontend/Rust/visual suite passes; owning docs describe implemented state. |

Execute tasks in listed order unless dependency notes permit parallel work. Every task must preserve unrelated work and finish with diff review.

## Phase 1: Foundation and Data Model

### KBN-101 — Add Deferred Status Across Domain

- **Description:** Add `[>]` as canonical `deferred` task status across Rust parsing/writing/query validation, generated IPC types, frontend runtime guards, structured editor status controls, and status styling. Keep `[<]` event behavior unchanged. Update task-syntax and query-DSL specifications in same change.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - [ ] Parser maps `[>]` to `deferred` and keeps item type `task` unless scheduling metadata makes it an event.
  - [ ] Writer maps `deferred` back to `[>]` without changing unrelated Markdown.
  - [ ] `status = deferred` compiles through query DSL; unknown statuses remain rejected.
  - [ ] Rust-generated DTO and frontend `Task`/runtime guard accept `deferred`.
  - [ ] Existing task editor can select Deferred.
  - [ ] Existing status controls render Deferred distinctly without breaking other states.
  - [ ] Completion metadata remains tied only to Done transitions.
  - [ ] `docs/specifications/task-syntax.md` and `docs/specifications/query-dsl.md` describe implemented behavior.
- **Validation / Verification:**
  - Run focused parser, writer, query, and binding-export tests.
  - Run `npm run ipc:check`, `npm run format:check`, `npm run lint`, and `npm run build`.
  - Run `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test --all-targets` from `src-tauri`.

### KBN-102 — Preserve Context Order and Index Primary Context

- **Description:** Preserve every parsed context in source order, derive first context as `primary_context`, store it on task index rows, and add ordered positions to context associations. Change `@context` queries to primary-only semantics. Bump index-format version so derived data rebuilds safely. Update database and context-query specifications.
- **Dependencies:** KBN-101.
- **Acceptance Criteria:**
  - [ ] Parser output retains context token order exactly.
  - [ ] Generated task DTO exposes `primary_context: string | null` while retaining complete `contexts` array.
  - [ ] `tasks.primary_context` is indexed; context association rows retain zero-based source position.
  - [ ] Database reconstruction returns contexts in original source order.
  - [ ] `@foo` query terms match only `primary_context = 'foo'`.
  - [ ] Secondary contexts remain stored and returned but do not appear as effective navigation/filter values.
  - [ ] Index-format mismatch clears and rebuilds only disposable derived rows.
  - [ ] Empty-context tasks return `primary_context = null`.
  - [ ] `docs/specifications/database.md`, `docs/specifications/query-dsl.md`, and `docs/specifications/task-syntax.md` match implementation.
- **Validation / Verification:**
  - Add parser fixtures for zero, one, and multiple contexts plus excluded metadata zones.
  - Add database tests for ordered reconstruction, primary lookup, incremental reindex, and clean rebuild.
  - Add query tests proving secondary context does not match `@context`.
  - Run full Rust gate and `npm run ipc:check`.

### KBN-103 — Implement Atomic Task Move Command

- **Description:** Add source-preserving Rust mutation and typed Tauri command that updates status plus optional primary context in one guarded write. Omitted context means preserve all context tokens. Named context replaces first token or inserts one when absent. Empty context input is invalid. Reindex before returning success.
- **Dependencies:** KBN-101, KBN-102.
- **Acceptance Criteria:**
  - [ ] Status-only move preserves every context token byte-for-byte.
  - [ ] Named-context move replaces only first context token and preserves remaining token order.
  - [ ] Named-context move inserts one context when none exists using canonical metadata placement.
  - [ ] Unsupported status, empty context, malformed source, and unauthorized path fail with structured error.
  - [ ] Missing, changed, or ambiguous original source uses existing conflict codes.
  - [ ] File replacement remains atomic and preserves permissions.
  - [ ] Changed file is indexed before command resolves.
  - [ ] Frontend IPC adapter exposes typed `moveTask` request.
  - [ ] Generated IPC bindings remain clean.
- **Validation / Verification:**
  - Add writer tests for status-only, replace-first, insert-first, secondary preservation, line drift, duplicate ambiguity, and failure atomicity.
  - Add command-level test using temporary vault and database.
  - Run full Rust gate and frontend generated-contract/build gate.

## Phase 2: Core Workflows

### KBN-201 — Build Deterministic Board Projection

- **Description:** Extract pure frontend logic that converts selected-project tasks into status columns and context groups. Implement hierarchical project scoping, event/child exclusion, closed-status filtering, search, relative project labels, context ordering, and deterministic card sorting. Add minimal Vitest configuration because no frontend unit runner currently exists.
- **Dependencies:** KBN-101, KBN-102.
- **Acceptance Criteria:**
  - [ ] Exact project and descendant tasks enter board; similarly prefixed sibling names do not.
  - [ ] Events and standalone child cards are excluded.
  - [ ] Default columns contain Todo, Doing, and Deferred only.
  - [ ] Done and Cancelled appear only when enabled.
  - [ ] Context-free group sorts first; populated named groups sort alphabetically.
  - [ ] Cards sort by priority, due date, file path, and line number with defined null handling.
  - [ ] Direct-project cards omit project badge; descendants receive relative path.
  - [ ] Search runs before empty groups disappear.
  - [ ] Pure projection remains independent from React and Tauri IPC.
  - [ ] `npm test` runs focused frontend unit tests non-interactively.
- **Validation / Verification:**
  - Add table-driven unit tests for every projection and ordering rule.
  - Run `npm test`, `npm run format:check`, `npm run lint`, and `npm run build`.

### KBN-202 — Create Kanban Component and Storybook States

- **Description:** Build shared Kanban board, status column, context group, and drop-preview components using existing Octarine tokens and TaskCard behavior. Implement callbacks only; do not integrate native writes yet. Create named Storybook states required by project visual workflow.
- **Dependencies:** KBN-201.
- **Acceptance Criteria:**
  - [ ] Three active status columns render in fixed order with readable widths.
  - [ ] Closed columns append right when enabled.
  - [ ] Context-free tasks render before named groups.
  - [ ] Cards show agreed metadata and relative subproject badge while context stays in group heading.
  - [ ] Root cards keep existing nested-subtask presentation and card-to-editor activation semantics.
  - [ ] Status header, context-free group, and named context group expose distinct drop feedback.
  - [ ] Drop preview states exact intended mutation.
  - [ ] Board scrolls horizontally at narrow viewport instead of stacking or compressing columns.
  - [ ] Storybook covers populated, empty, closed-column, descendant-project, context-rich, drag-preview, error-rollback, more-than-50-card, and narrow states.
  - [ ] Focus treatment and semantic labels remain visible and meaningful.
- **Validation / Verification:**
  - Inspect every named Storybook state at specified desktop and narrow viewports.
  - Add Playwright screenshot coverage but do not update approved baselines before user approval.
  - Run `npm run visual:test`, recording expected new-baseline failures separately from regressions.
  - **Approval gate:** Stop for exact Storybook visual approval before KBN-203.

### KBN-203 — Integrate Project Board/List Navigation

- **Description:** Mount approved shared board for `proj:` routes, retain existing list view, add Board/List switch, default fresh profiles to Board, and persist one global presentation preference in client-local storage. Keep other sidebar routes unchanged.
- **Dependencies:** KBN-202 visual approval.
- **Acceptance Criteria:**
  - [ ] Project selection opens remembered presentation mode.
  - [ ] Fresh profile opens Board.
  - [ ] Board/List selection persists across app restart and applies globally to projects.
  - [ ] Switching presentation preserves selected project, search text, and loaded tasks.
  - [ ] All, Todo, Doing, Events, context, tag, custom-view, and file-editor routes keep existing presentation.
  - [ ] Invalid stored preference falls back to Board.
  - [ ] Approved Storybook component is reused directly; no app-only visual copy exists.
- **Validation / Verification:**
  - Add component/integration coverage for route selection and preference fallback.
  - Render app project route at desktop and narrow widths.
  - Restart development app and verify preference persistence.
  - Run frontend format, lint, build, and visual gates.

### KBN-204 — Connect Drag Intent to Optimistic Native Moves

- **Description:** Convert drop targets into explicit status-only or status-plus-primary-context intents. Apply optimistic task update through Zustand, call `move_task`, reconcile on success, and rollback on failure. Existing editor remains non-pointer mutation path.
- **Dependencies:** KBN-103, KBN-203.
- **Acceptance Criteria:**
  - [ ] Status-header drop changes status and preserves all contexts.
  - [ ] Context-free-group drop changes status and preserves all contexts.
  - [ ] Named-group drop changes status and first context only.
  - [ ] Drop with unchanged status/context performs no write.
  - [ ] Contextual card dropped on context-free group settles into its actual context group after move.
  - [ ] Optimistic state matches intended final group immediately.
  - [ ] Failure restores previous task state and presents structured error.
  - [ ] Conflict failure refreshes indexed tasks before interaction continues.
  - [ ] Drag operation cannot reassign project, reorder cards, clear context, or mutate subtasks implicitly.
  - [ ] Drag activation does not break card click/editor or nested subtask controls.
- **Validation / Verification:**
  - Unit-test drop-intent reduction and optimistic commit/rollback state transitions.
  - Storybook interaction checks cover every drop target and no-op behavior.
  - Native temporary-vault smoke test verifies exact resulting Markdown.
  - Run frontend, visual, generated-contract, and Rust gates.

### KBN-205 — Add Closed Filters, Search, and Empty States

- **Description:** Add project-board controls for showing Done and Cancelled, wire existing search into board projection, and implement active-board and filtered-empty messaging. Keep closed visibility off by default; no task-creation action.
- **Dependencies:** KBN-203.
- **Acceptance Criteria:**
  - [ ] Done and Cancelled controls operate independently.
  - [ ] Enabled closed columns append after Deferred in stable order.
  - [ ] Closed visibility remains presentation state and does not mutate Markdown.
  - [ ] Search filters card title/project using existing search semantics.
  - [ ] Empty groups disappear after search.
  - [ ] No-active-task state points users toward closed filters.
  - [ ] No-search-result state distinguishes filtering from empty project.
  - [ ] No creation shortcut appears.
- **Validation / Verification:**
  - Add projection/control tests for all closed-filter combinations and empty states.
  - Add Storybook states and approved visual snapshots.
  - Inspect rendered app with search and filter transitions.
  - Run frontend and visual gates.

## Phase 3: Integration, Security, and Polish

### KBN-301 — Virtualize Large Context Groups

- **Description:** Use `@tanstack/react-virtual` for any context group exceeding 50 cards while retaining exact ordering, measured dynamic card heights, nested-subtask rendering, drag hit targets, and horizontal board layout. Smaller groups retain direct rendering.
- **Dependencies:** KBN-202, KBN-204.
- **Acceptance Criteria:**
  - [ ] Groups with 50 or fewer cards render without virtualization.
  - [ ] Groups with more than 50 cards mount bounded visible rows plus overscan.
  - [ ] Dynamic TaskCard height changes are measured without overlap.
  - [ ] Dragging visible cards targets correct status/context after scroll.
  - [ ] Search or mutation scroll changes do not produce blank lanes or stale cards.
  - [ ] Keyboard focus remains stable when focused card stays within rendered window.
  - [ ] Board with 1,000 generated project tasks remains responsive under documented manual profile.
- **Validation / Verification:**
  - Add deterministic Storybook fixture with more than 50 mixed-height cards.
  - Assert bounded mounted-card count through Playwright.
  - Exercise scroll, search, status drop, context drop, and rollback in large fixture.
  - Record browser/webview performance trace and avoid unverified frame-rate claims.
  - Run frontend build and visual regression suite.

### KBN-302 — Verify Source Safety and External-Edit Reconciliation

- **Description:** Exercise Kanban mutations against stale, shifted, duplicate, externally edited, and unauthorized sources. Confirm frontend rollback and watcher/index ordering preserve Markdown authority.
- **Dependencies:** KBN-204.
- **Acceptance Criteria:**
  - [ ] Line shifts resolve only through existing safe nearby-match behavior.
  - [ ] Duplicate ambiguous source fails without changing file.
  - [ ] External edit between drag start and drop produces conflict and board refresh.
  - [ ] Unauthorized or escaped path fails before filesystem mutation.
  - [ ] Successful move updates Markdown before SQLite and UI reconciliation.
  - [ ] Failed move leaves Markdown and derived index mutually consistent.
  - [ ] Diagnostics contain stable code and static redacted message only.
- **Validation / Verification:**
  - Add Rust integration tests using unique temporary vaults/databases.
  - Run native app smoke scenarios for watcher update and conflict recovery.
  - Inspect diagnostic output for content/path leakage.
  - Run full Rust gate and relevant frontend interaction tests.

### KBN-303 — Synchronize Architecture and Product Documentation

- **Description:** Record implemented behavior after verification. Update proposed ADR 0006 rather than erasing decision history, mark exact implementation status, and synchronize current architecture, design conventions, and roadmap. Do not claim unverified performance or platform support.
- **Dependencies:** KBN-301, KBN-302, approved app visuals.
- **Acceptance Criteria:**
  - [ ] ADR 0006 records final status, Deferred marker, primary-context semantics, drop contract, and deviations from original proposal.
  - [ ] `docs/architecture.md` describes actual component, IPC, writer, and index flow.
  - [ ] `docs/DESIGN.md` contains only approved reusable Kanban conventions.
  - [ ] `docs/roadmap.md` marks completed transition without presenting future work as current.
  - [ ] Specifications agree with parser, database, query, and IPC behavior.
  - [ ] README changes only if user-facing current-capability summary needs Kanban mention.
  - [ ] All internal links and commands resolve.
- **Validation / Verification:**
  - Compare each documented behavior against implemented tests and rendered app.
  - Run Prettier check on changed Markdown and `git diff --check`.
  - Search for stale four-status unions and statements that `[>]` is unsupported.

### KBN-304 — Run Final Cross-Stack Release Gate

- **Description:** Perform final regression, rendered-app inspection, and diff audit. Fix only Kanban-related defects found. Record unverified items honestly. No commit, branch, PR, tag, or release action without separate authorization.
- **Dependencies:** All prior tasks.
- **Acceptance Criteria:**
  - [ ] Every project-definition acceptance criterion has evidence.
  - [ ] Existing non-project navigation and task editing remain functional.
  - [ ] Approved Storybook baselines match rendered component.
  - [ ] App integration matches approved Storybook design.
  - [ ] Temporary native vault confirms Todo, Doing, Deferred, Done, and Cancelled transitions.
  - [ ] Final diff contains no unrelated changes or generated drift.
  - [ ] Remaining risks and skipped checks are documented.
- **Validation / Verification:**
  - Run:

    ```bash
    npm test
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

  - Inspect approved Storybook states and integrated app at desktop and narrow viewports.
  - Review `git status`, `git diff --check`, generated IPC diff, dependency lockfile diff, and complete feature diff.

## Milestone Completion Rules

- Phase 1 completes only when Markdown → parser → index → query → writer → IPC round trip is verified.
- Phase 2 pauses at KBN-202 for exact Storybook approval. App integration starts only afterward.
- Phase 3 completes only when native source safety, rendered UI, full regression gates, and current-state documentation agree.
- Backlog completion does not authorize branch creation, commits, pull requests, merges, tags, releases, or other external changes.
