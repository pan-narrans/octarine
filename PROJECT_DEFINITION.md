# Project Definition: Project Kanban View

## 1. Executive Summary

### Overview

Add a project-scoped Kanban view that lets users review active work, understand each task's next execution context, and move tasks safely between statuses without leaving Octarine. Markdown remains authoritative; every board mutation rewrites the original task source through Rust's guarded writer path and refreshes the derived SQLite index.

Project selection includes direct and descendant tasks. Board shows active work in `TO-DO`, `DOING`, and `DEFERRED` columns. Each column groups root tasks by one flat primary context. First context token in Markdown is primary; later context tokens remain preserved but do not affect grouping or context filters.

### Target Audience

Primary user manages changing personal or professional projects in a local Markdown vault. New tasks arrive continuously, active tasks may depend on people or actions, and paused tasks must remain visible enough to avoid being forgotten.

Primary job:

> Open a project, scan active task state and context, then move tasks between statuses or contexts without losing Markdown data.

### Scope Boundary

#### In Scope — MVP

- `Board / List` switch on project views; Board is default and preference persists globally.
- Hierarchical project scope: selected project plus all descendants.
- Relative descendant-project badge on cards; direct project tasks omit redundant project badge.
- Active columns in fixed order: `TO-DO`, `DOING`, `DEFERRED`.
- Optional `DONE` and `CANCELLED` columns, hidden by default and enabled through status filters.
- New deferred checkbox marker: `[>]`.
- Flat contexts. First source-order context is primary.
- Context-free task group first; named groups follow alphabetically.
- Only populated groups render.
- Status-header or context-free-group drop changes status while preserving all contexts.
- Named-context-group drop changes status and replaces only first context token; later context tokens remain unchanged.
- Existing task editor remains keyboard/non-pointer path for status and context changes.
- Root tasks render as cards; existing nested subtasks stay inside parent card.
- Card content: title, tags, priority, due date, relative subproject badge, existing compact subtask content.
- Card click opens existing structured editor. Source file and notes remain editor-only.
- No manual card ordering. Sort by priority, due date, then source path and line number.
- Existing search filters visible cards and removes empty groups.
- Calendar events excluded.
- Optimistic drag feedback with rollback and existing structured error presentation on failed or stale writes.
- Horizontal board scrolling on narrow layouts; status columns do not stack.
- Empty active board state explains closed-task filters.
- More than 50 cards in one group uses list virtualization, following ADR 0010.

#### Out of Scope — Future

- Dedicated review workflow or review status.
- Deferred resurfacing dates, reminders, or aging automation.
- Manual ranking or persisted card order.
- WIP limits.
- Task creation shortcut from board.
- Arbitrary context creation through drag when target group is empty.
- Nested context or tag namespaces as a board concept.
- Multiple effective contexts, assignees, or action/person context types.
- Drag-based context clearing. Context removal remains explicit in task editor.
- Calendar-event lanes or timeline tracks.
- Cross-project drag or project reassignment.
- Mobile-specific interaction design.

## 2. Technical Architecture

### Tech Stack

| Layer                | Technology                  | Role and justification                                                                                                                   |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell        | Tauri 2                     | Existing trusted filesystem and IPC boundary.                                                                                            |
| Frontend             | React 18.3 + TypeScript 5.2 | Existing UI stack and typed task contracts.                                                                                              |
| State                | Zustand 4.5                 | Existing task state; supports optimistic card mutation and targeted rollback.                                                            |
| Board interaction    | Native pointer/drag events  | MVP needs status/context drop zones, not sortable lists; avoids new drag dependency. Existing editor supplies non-pointer mutation path. |
| Large-list rendering | `@tanstack/react-virtual`   | Required by ADR 0010 for groups exceeding 50 cards. Add compatible version during implementation and lock it in package metadata.        |
| Native domain layer  | Rust                        | Canonical parsing, validation, source-preserving mutation, indexing, and path authorization.                                             |
| Derived index        | SQLite WAL                  | Existing disposable query cache. New stored meaning requires index-format bump and rebuild.                                              |
| Component review     | Storybook 10.5              | Canonical visual review surface required by project workflow.                                                                            |
| Visual regression    | Playwright 1.62             | Existing screenshot test framework for approved Storybook states.                                                                        |

### System Design

1. Sidebar project selection continues producing `proj:<path>` navigation state.
2. Project surface selects persisted `Board` or `List` presentation mode. Preference uses client-local presentation storage; Markdown and native configuration remain unchanged.
3. Existing project prefix rule scopes tasks to exact project plus descendants.
4. Kanban view excludes events and standalone child cards, applies closed-status filters and current search, then groups tasks by status and `primary_context`.
5. Cards sort deterministically without persisted board order.
6. Drag start captures immutable task identity plus original raw Markdown.
7. Drop target produces one explicit intent:
   - status target: `{ new_status, new_primary_context: omitted }`
   - named context target: `{ new_status, new_primary_context: "context" }`
8. Frontend updates card optimistically and invokes one native mutation. One command performs status and optional primary-context change atomically against source.
9. Rust resolves and authorizes path, verifies original source, rewrites first line while preserving unrelated Markdown and secondary contexts, atomically replaces file, then indexes changed file.
10. Success reconciles from indexed task state. Structured write failure rolls optimistic state back, refreshes tasks on conflicts, and presents redacted error.
11. External watcher updates continue refreshing board from indexed Markdown state.

### Interaction Contract

| Drop target         | Status mutation                    | Context mutation           | Result                                                                                                        |
| ------------------- | ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Status header       | Set destination status             | Preserve                   | Card moves to matching primary-context group in destination column.                                           |
| Context-free group  | Set destination status             | Preserve                   | Contextual card moves to matching named group after refresh; context-free card remains in context-free group. |
| Named context group | Set destination status             | Replace first context only | Card moves into selected named group; secondary source contexts remain untouched.                             |
| Original group      | None when status/context unchanged | None                       | No write.                                                                                                     |

Drop preview must state exact effect, such as `Move to Doing; keep @call` or `Move to Doing; set @ana`.

### Status Model

| Markdown                | Canonical status | Default board visibility |
| ----------------------- | ---------------- | ------------------------ |
| `[ ]`                   | `todo`           | Visible                  |
| `[/]`                   | `doing`          | Visible                  |
| `[>]`                   | `deferred`       | Visible                  |
| `[x]` / `[X]`           | `done`           | Hidden                   |
| `[-]`                   | `cancelled`      | Hidden                   |
| `[<]` or scheduled item | Event            | Excluded                 |

Status query language accepts `deferred`. Existing completion-date behavior remains tied only to `done`.

### Context Model

```typescript
type TaskStatus = "todo" | "doing" | "deferred" | "done" | "cancelled";

interface KanbanTask extends ParsedTask {
  status: TaskStatus;
  contexts: string[]; // Every parsed token, preserved in source order.
  primary_context: string | null; // First token only.
}

interface MoveTaskRequest {
  filePath: string;
  lineNumber: number;
  originalRawMarkdown: string;
  newStatus: TaskStatus;
  newPrimaryContext?: string; // Omitted means preserve current contexts.
}

interface KanbanPreferences {
  projectViewMode: "board" | "list";
  visibleClosedStatuses: Array<"done" | "cancelled">;
}
```

Rules:

- Parser preserves context token order.
- `primary_context = contexts[0] ?? null`.
- Context grouping, sidebar context navigation, and `@context` query terms match primary context only.
- Secondary contexts remain visible in task editor/source representation but remain semantically inert.
- New and editor-created tasks emit at most one context unless user source already contains more.
- Named-group drop replaces first context token in place. If task has none, new token is inserted using existing metadata formatting rules.
- No board action removes contexts.
- Tags remain unordered, flat, multi-valued metadata and retain existing query behavior.

### Database and Index Model

SQLite remains disposable. Proposed cache changes:

```sql
ALTER TABLE tasks ADD COLUMN primary_context TEXT;
CREATE INDEX idx_tasks_primary_context ON tasks(primary_context);

-- Recreate derived association table so DTO reconstruction preserves source order.
CREATE TABLE task_contexts (
    task_id INTEGER NOT NULL,
    context_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (task_id, position),
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
);
```

Indexer writes every context with zero-based source position and copies first value to `tasks.primary_context`. Task queries aggregate contexts ordered by `position`. Context filters query indexed `tasks.primary_context`; tag filters retain association-table semantics. Index-format version increments so startup rebuilds derived rows from Markdown.

### IPC Contract

No HTTP API exists. Frontend uses typed Tauri IPC.

```typescript
function moveTask(request: MoveTaskRequest): Promise<void>;
```

Native command shape:

```rust
#[tauri::command]
fn move_task(
    state: State<'_, AppState>,
    file_path: String,
    line_number: usize,
    original_raw_markdown: String,
    new_status: String,
    new_primary_context: Option<String>,
) -> Result<(), WriteError>;
```

`None` means preserve contexts. Empty string is invalid. Context clearing is unsupported by this command. Generated TypeScript DTOs must be refreshed after Rust contract changes.

### Sorting and Grouping

Tasks sort using stable tuple:

```text
(priority_present desc, priority asc,
 due_date_present desc, due_date asc,
 file_path asc, line_number asc)
```

Context-free group renders first when populated. Remaining group labels use locale-aware alphabetical order. Search and status filters run before empty groups are removed.

### Visual and Responsive Contract

- Reuse Octarine surfaces, spacing, metadata pills, focus treatments, and task-card entry behavior.
- Keep fixed logical column order. Closed columns append right when enabled.
- Board owns horizontal overflow. Each status column keeps readable card width instead of compressing or stacking.
- Drop targets expose visible hover/focus state and exact mutation preview.
- Storybook covers populated, empty, closed-column, descendant-project, context-rich, drag-preview, error-rollback, and narrow-width states.
- Storybook implementation requires explicit approval before app integration, per `docs/visual-development.md`.

## 3. Security, Authentication, and APIs

### Authentication

No authentication added. Feature remains local-first and operates only on user-configured vault files.

### Filesystem Safety

- Native command reuses vault-path canonicalization and root confinement.
- Mutation includes original raw Markdown and uses existing stale/missing/ambiguous-source errors.
- Status plus context update occurs in one atomic source write.
- Failed mutation never leaves SQLite ahead of Markdown.
- Index refresh completes before frontend receives successful completion.
- Diagnostics remain redacted: no task text, context values, project paths, or filesystem paths in operational messages.

### API Surface

- Add typed `move_task` Tauri command.
- Extend generated task DTO with `primary_context` and `deferred` status support.
- Extend query compiler allowlist with `status = deferred`.
- No network calls, external integrations, hosted accounts, or telemetry.

## 4. Acceptance Criteria

### Product Behavior

1. Selecting project opens remembered Board/List mode; fresh profile defaults to Board.
2. Board includes direct and descendant project tasks and displays only relative descendant path badges.
3. Default board renders `TO-DO`, `DOING`, and `DEFERRED`; events, done, and cancelled tasks remain absent.
4. Closed-status filters append `DONE` and/or `CANCELLED` without losing project, search, or context scope.
5. First Markdown context alone controls board grouping and context filtering; later contexts survive parsing, indexing, unrelated edits, and status moves in original order.
6. Status-header or context-free-group drop changes status and preserves every context token.
7. Named-context-group drop changes status and first context in one safe write while preserving later contexts.
8. Failed or conflicting drop restores prior UI state and exposes structured error feedback.
9. Root cards render existing nested subtasks without duplicate child cards.
10. Sorting remains deterministic across refresh and restart; drag position never persists.
11. Search removes nonmatching cards and empty groups.
12. Narrow board scrolls horizontally and retains readable columns.
13. Card/editor and existing non-project list behavior remain functional.

### Verification Strategy

- Rust parser tests: `[>]`, deferred status, ordered contexts, primary-context derivation, exclusion zones.
- Rust writer tests: status-only preservation, first-context replacement, no-context insertion, secondary-context preservation, stale/missing/ambiguous source, completion metadata boundaries.
- Rust database tests: ordered association rows, primary-context query behavior, index-format rebuild, exact/descendant project scope.
- Query DSL tests: `status = deferred`; `@context` matches primary only.
- Frontend logic tests: project-relative labels, grouping, group ordering, sorting, filters, root-task selection, drop-intent reduction, optimistic rollback.
- Storybook named states and Playwright screenshots at desktop and narrow viewports.
- Rendered Storybook inspection, explicit visual approval, then rendered app inspection.
- Native smoke test against temporary vault: every drop intent changes expected Markdown and watcher/index state.
- Full required gates:

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

## 5. Documentation and Decision Updates

Implementation must update:

- `docs/adr/0006-hierarchical-kanban-navigation.md`: accepted board contract, primary-context semantics, Deferred state, and completed implementation status.
- `docs/specifications/task-syntax.md`: `[>]` marker and first-context semantics.
- `docs/specifications/query-dsl.md`: `deferred` status and primary-context matching.
- `docs/specifications/database.md`: primary-context field, context ordering, index-format change.
- `docs/architecture.md`: implemented Kanban components, IPC mutation path, and index behavior.
- `docs/DESIGN.md`: approved reusable board, column, group, and drop-target conventions only after Storybook approval.
- `docs/roadmap.md`: milestone progress after implementation.

## 6. Explicit Assumptions

- “Review project” means visually inspect overall task state, not introduce Review status.
- Context represents next execution requirement, whether person, action, place, or tool.
- Context and tag names remain flat even though existing parser permits slash characters.
- Secondary contexts are preserved for source integrity but intentionally ignored by product semantics.
- Board mode preference is global, not per project.
- Existing editor provides sufficient accessible fallback for drag operations.
- MVP targets current desktop app; narrow layout remains usable but does not introduce mobile-specific gestures.
