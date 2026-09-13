# Project Definition: Auto-Hide Inactive Projects

## 1. Executive Summary

### Overview

Hide projects from sidebar when none of their indexed tasks are active. Active means status is
`todo`, `doing`, or `deferred`; inactive means every indexed task is `done` or `cancelled`.
Scheduled events and nested checklist tasks participate in same status rule.

Filtering affects sidebar navigation only. Full project catalog remains available to task creation,
task editing, Markdown editing, search, custom queries, and direct file navigation. Users can reveal
inactive projects through compact `Show inactive` control beside Projects heading. Preference is
enabled by default as auto-hide, persists immediately per vault, and survives restart.

### Target Audience

Octarine users with long-lived Markdown vaults where completed projects accumulate in sidebar and
obscure current work.

Primary job:

> Open Octarine and see projects containing actionable work without losing access to completed
> project history.

### Scope Boundary

#### In Scope — MVP

- Hide inactive projects from sidebar Projects tree only.
- Treat `todo`, `doing`, and `deferred` tasks as active.
- Treat `done` and `cancelled` tasks as inactive.
- Count active schedule events and active indexed subtasks.
- Use first indexed project token only.
- Keep ancestors visible when active descendant project is visible.
- Hide inactive child when parent alone remains active.
- Keep selected project visible if it becomes inactive; remove it after user navigates elsewhere.
- Apply same behavior after native mutation, Undo, watcher refresh, or other indexed-state refresh.
- Add compact `Show inactive` control beside Projects heading.
- Persist reveal preference per vault in client-local storage; default to hiding inactive projects.
- Keep Projects heading and reveal control visible when catalog contains projects but every project is
  inactive.
- Hide entire Projects section when full catalog contains no projects.
- Animate removal and insertion using brief 0.2-second opacity and collapse transition.
- Preserve existing project ordering.
- Keep all inactive projects available in creation and editing autocomplete.
- Cover projection, persistence, component states, visual behavior, and full repository gates.
- Update owning design and architecture documentation.

#### Out of Scope — Future

- Manual project archiving, deletion, or inactive-project management screen.
- Project counts or inactive counts.
- Changing project parsing, task syntax, SQLite schema, or native IPC.
- Treating secondary project tokens as effective project membership.
- Filtering autocomplete, search, custom views, task lists, editors, or direct file navigation.
- Reordering reactivated projects by activity time.
- Screen-reader live-region announcement when project visibility changes.
- Backend pagination or new large-vault performance claims.

## 2. Technical Architecture

### Tech Stack

| Layer               | Technology                                | Role and justification                                                                                                        |
| ------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell       | Tauri 1.6                                 | Existing local application shell; no native contract change required.                                                         |
| Frontend            | React 18.3 + TypeScript 5.2               | Current sidebar and project catalog live in React.                                                                            |
| Client state        | React state and memoized pure projections | Separates full catalog from sidebar-visible catalog without duplicating durable state.                                        |
| Preference storage  | Webview `localStorage`                    | Existing presentation-preference mechanism; vault-qualified key provides restart persistence without native config migration. |
| Styling             | Existing CSS tokens and transitions       | Matches established 0.2-second motion and sidebar controls.                                                                   |
| Component review    | Storybook 10.5                            | Required source of truth for new sidebar states.                                                                              |
| Visual regression   | Playwright 1.62                           | Verifies approved Storybook states and transition endpoints.                                                                  |
| Native domain layer | Existing Rust parser and SQLite index     | Supplies canonical project, status, type, and parent relationship unchanged.                                                  |

### System Design

1. Loaded indexed tasks remain sole input for project discovery.
2. One memoized projection derives full canonical project catalog and active canonical project set.
3. Full catalog continues feeding editors, task capture, Dashboard, and other existing consumers.
4. Sidebar receives separate visible catalog:
   - all projects when `showInactiveProjects` is true;
   - active projects when false;
   - selected project as exception when false and selection uses project route.
5. Existing tree builder reconstructs ancestor nodes from visible hierarchical paths. Active
   `+org/team` therefore renders both `org` and `team` even when `+org` has no direct active task.
6. Existing exact-plus-descendant project view behavior remains unchanged.
7. Status mutation, Undo, and watcher refresh update task state. Projection recomputes and sidebar
   transitions affected nodes without native coordination.
8. Preference loads after active vault identity resolves. Vault change loads matching stored value or
   default `false` for `showInactiveProjects`.
9. Toggle writes updated value immediately. Storage read/write failure falls back to default behavior
   without blocking navigation.

### Visibility Rules

```typescript
type TaskStatus = "todo" | "doing" | "deferred" | "done" | "cancelled";

const ACTIVE_PROJECT_STATUSES: ReadonlySet<TaskStatus> = new Set(["todo", "doing", "deferred"]);

interface ProjectCatalogProjection {
  allProjects: string[];
  sidebarProjects: string[];
}

interface ProjectVisibilityOptions {
  showInactiveProjects: boolean;
  selectedProject: string | null;
}
```

Canonical examples:

```text
+alpha: todo + done       => visible
+beta: deferred           => visible
+gamma: done + cancelled  => hidden
+delta: no indexed tasks  => absent
+org/team: doing          => org and org/team visible
```

Task example:

```markdown
- [ ] Ship release +work/client +quarterly
```

Only `work/client`, first indexed project, participates. `quarterly` does not activate project.

Rules:

- Every indexed item participates, including `type: event` and nested checklist items.
- Item with no canonical `project` activates no project.
- Active nested task activates its own indexed canonical project. Structured task creation already
  inherits parent project into created descendants; manually authored projectless child remains
  unprojected.
- Visible descendant path synthesizes all ancestor nodes through existing tree construction.
- Selected inactive project and required ancestors remain visible until route changes.
- Inactive siblings and children remain hidden unless reveal control is enabled.
- Full-catalog order remains source order already exposed by task collection; projection performs no
  activity-based sorting.

### Preference Model

```typescript
const PROJECT_VISIBILITY_KEY_PREFIX = "octarine.sidebar.show-inactive-projects";

interface ProjectVisibilityPreference {
  showInactiveProjects: boolean; // default false
}
```

Storage identity combines stable prefix with active effective vault path. Values are local to webview
profile and never written into Markdown, SQLite, or native application configuration. Path remains
local and is not logged or transmitted.

Malformed value, unavailable storage, or read failure resolves to `showInactiveProjects: false`.
Write failure leaves in-memory choice active for current session.

### UI and Motion Contract

- Projects heading becomes row containing existing heading label plus compact `Show inactive`
  control.
- Control uses native button or checkbox semantics, keyboard activation, visible focus treatment, and
  pressed/checked state. No live-region announcement required.
- Control renders whenever full catalog contains at least one project, even when filtered list is
  empty.
- No count badge or inactive total renders.
- Nodes entering or leaving use 0.2-second opacity plus vertical collapse/expand transition.
- Transition affects sidebar layout only and avoids horizontal movement.
- Selected inactive node does not animate out until user leaves project route.
- Existing `prefers-reduced-motion` behavior should suppress nonessential transition when available;
  no new custom accessibility announcement is added.
- Existing rename affordance remains available for revealed inactive projects and selected inactive
  project.

### Performance Contract

Project documentation defines accepted large-vault fixture as 20,000 Markdown files and 2,000,000
indexed tasks on local SSD. Fixture is test contract, not current latency guarantee.

Implementation must:

- derive full and active project sets in one linear pass over loaded tasks;
- memoize projection against task collection and visibility inputs;
- avoid one task scan per project;
- avoid backend round trip for toggle or visibility recomputation;
- add no claim about load or transition latency without measurement.

No new benchmark requirement exists for MVP. Existing fixture remains regression context during code
review.

## 3. Security, Authentication, and APIs

### Authentication

No authentication added. Feature remains local-only.

### Data Safety and Privacy

- Markdown remains authoritative and is never mutated by visibility control.
- SQLite remains unchanged disposable index.
- Preference remains client-local presentation state.
- Vault-qualified preference key never leaves local webview storage.
- Storage failures cannot block task access, project navigation, or source mutation.
- Hidden means omitted from one sidebar projection, not deleted, archived, or excluded from queries.

### API Surface

No HTTP, Tauri IPC, Rust DTO, database, parser, or filesystem contract changes.

Expected frontend-only interfaces:

```typescript
function projectCatalogs(
  tasks: readonly Task[],
  options: ProjectVisibilityOptions,
): ProjectCatalogProjection;

function readShowInactiveProjects(
  storage: Pick<Storage, "getItem">,
  vaultIdentity: string,
): boolean;

function writeShowInactiveProjects(
  storage: Pick<Storage, "setItem">,
  vaultIdentity: string,
  showInactiveProjects: boolean,
): void;
```

## 4. Acceptance Criteria

### Product Behavior

1. Fresh vault preference hides projects having only `done` and/or `cancelled` tasks.
2. Project containing at least one `todo`, `doing`, or `deferred` item remains visible.
3. Active scheduled event keeps canonical project visible.
4. Active indexed subtask keeps its own canonical project visible independently of parent status.
5. Active descendant project keeps every hierarchy ancestor visible.
6. Inactive child disappears while active parent remains visible.
7. Secondary project token never affects visibility.
8. `Show inactive` reveals all projects without changing task data or navigation semantics.
9. Reveal choice persists for same vault across restart and remains independent between vault paths.
10. When selected project loses last active item, selected node and ancestors remain visible.
11. After leaving selected inactive project, its node disappears when reveal is disabled.
12. External Markdown changes apply same selected-project exception and visibility rules.
13. Undo or other reactivation makes hidden project reappear immediately after task-state reconciliation.
14. Insertions and removals animate with 0.2-second opacity and vertical size transition.
15. Projects heading and reveal control remain when full catalog is nonempty but filtered catalog is
    empty.
16. Entire Projects section remains absent when full catalog is empty.
17. Full project catalog remains unchanged for task creation, task editing, Markdown editing, search,
    custom views, and direct file access.
18. Revealed inactive project retains existing selection and rename behavior.
19. Existing project order and exact-plus-descendant project task view remain unchanged.
20. Storage failure retains safe default and does not break sidebar.
21. No project or inactive count appears.

### Verification Strategy

- Pure frontend tests:
  - all five statuses;
  - active events;
  - nested tasks;
  - first-project semantics;
  - parent/child hierarchy projection;
  - selected inactive exception;
  - stable ordering;
  - empty full and visible catalogs.
- Preference tests:
  - default value;
  - same-vault restart round trip;
  - independent vault identities;
  - malformed values;
  - storage read/write exceptions.
- Sidebar component and Storybook states:
  - mixed active/inactive projects;
  - all inactive with reveal disabled;
  - reveal enabled;
  - selected inactive project;
  - active descendant with synthetic ancestor;
  - insertion/removal transition endpoints;
  - narrow viewport.
- Playwright screenshot coverage for approved stable transition endpoints. Motion timing receives
  rendered manual inspection rather than timing-sensitive screenshot assertion.
- Rendered Storybook inspection and explicit approval before app integration.
- Rendered app inspection after integration for status mutation, navigation-away removal, Undo,
  vault switch, focus behavior, and nearby sidebar regression.
- Full frontend and native gates:

  ```bash
  npm run test
  npm run ipc:check
  npm run format:check
  npm run lint
  npm run build
  npm run storybook:build
  npm run visual:test
  cd src-tauri
  cargo fmt --all -- --check
  cargo clippy --all-targets -- -D warnings
  cargo test --all-targets
  ```

Native tests remain unchanged because feature adds no Rust behavior. Full Rust gate still runs for
repository-wide verification.

## 5. Documentation Updates

Implementation must update:

- `docs/DESIGN.md`: Projects heading control, inactive filtering, selected-project exception, and
  accepted 0.2-second sidebar transition after visual approval.
- `docs/architecture.md`: full-versus-visible frontend project projections and per-vault client-local
  preference.

No task syntax, parser, database, configuration, query DSL, roadmap, or ADR update is required unless
implementation changes scope described here.

## 6. Explicit Assumptions

- “Project” means first canonical project indexed on task.
- “Active task” includes event and nested task because status, not type or hierarchy level, controls
  activity.
- Projectless manually authored child does not inherit visibility membership from parent at projection
  time.
- Per-vault identity uses effective path returned by current native vault configuration command.
- Existing ordering means first-seen project order from loaded task collection and existing tree
  insertion behavior.
- Auto-hide is enabled by default, equivalent to `showInactiveProjects: false`.
- Reveal control is persistent preference, not temporary session override.
- Selected-project exception ends when selected route stops targeting that project.
- Visual work follows mandatory Storybook approval before app integration.
