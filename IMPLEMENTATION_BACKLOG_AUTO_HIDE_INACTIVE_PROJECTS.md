# Actionable Implementation Backlog: Auto-Hide Inactive Projects

## Phase 1: Foundation and Projection Model

### AIP-101 - Derive Full and Sidebar Project Catalogs

- **Description:** Add pure memoizable projection that walks loaded tasks once, preserves full
  project order, identifies active canonical projects, and applies selected-project exception.
- **Acceptance Criteria:**
  - [ ] `todo`, `doing`, and `deferred` activate canonical project.
  - [ ] `done` and `cancelled` do not activate canonical project.
  - [ ] Events and indexed subtasks use same status rule.
  - [ ] Secondary project tokens and projectless tasks add no membership.
  - [ ] Selected inactive project remains in sidebar projection.
  - [ ] Full catalog remains unchanged for non-sidebar consumers.
- **Validation / Verification:** Run focused Vitest model suite covering status, hierarchy, selection,
  ordering, and empty catalogs.

### AIP-102 - Persist Per-Vault Reveal Preference

- **Description:** Add guarded local-storage adapter keyed by active vault identity. Default to
  `showInactiveProjects: false`; preserve in-memory behavior when writes fail.
- **Acceptance Criteria:**
  - [ ] Same vault restores preference across reload.
  - [ ] Different vault identities retain independent values.
  - [ ] Missing, malformed, or unreadable storage defaults to hiding inactive projects.
  - [ ] Write failure never blocks sidebar interaction.
- **Validation / Verification:** Run focused Vitest preference suite with fake and throwing storage.

## Phase 2: Core Sidebar Workflow

### AIP-201 - Add Inactive-Project Reveal Control

- **Description:** Extend shared sidebar component with full-catalog awareness, compact `Show
inactive` control, and filtered project tree input without changing other sidebar collections.
- **Acceptance Criteria:**
  - [ ] Control appears beside Projects heading when full catalog is nonempty.
  - [ ] Section remains present when filtered catalog is empty.
  - [ ] Toggle exposes keyboard, focus, and checked/pressed semantics.
  - [ ] No count renders.
  - [ ] Existing selection and rename actions remain functional.
- **Validation / Verification:** Inspect named Storybook states for mixed, all-inactive, revealed,
  selected-inactive, descendant, and narrow layouts.

### AIP-202 - Animate Sidebar Project Visibility

- **Description:** Add brief opacity and vertical collapse/expand motion using existing design
  conventions and stable tree-node identity.
- **Acceptance Criteria:**
  - [ ] Entering and leaving nodes animate for 0.2 seconds.
  - [ ] Horizontal position stays fixed.
  - [ ] Selected inactive project does not leave until navigation changes.
  - [ ] Reduced-motion preference suppresses nonessential animation.
- **Validation / Verification:** Inspect transition manually in rendered Storybook. Cover stable
  endpoints with visual regression.

## Phase 3: Integration, Documentation, and Verification

### AIP-301 - Integrate Per-Vault Visibility into App

- **Description:** Keep full project catalog for existing consumers, pass visible projection and
  preference control only to sidebar, and reload preference when active vault changes.
- **Acceptance Criteria:**
  - [ ] Task mutation, Undo, and watcher refresh recompute visibility.
  - [ ] Selected inactive exception ends after navigation away.
  - [ ] Vault switch loads matching preference.
  - [ ] Autocomplete, search, custom views, editors, and project view behavior remain unchanged.
- **Validation / Verification:** Render development fixture and native app workflow; inspect status
  mutation, navigation, Undo, and vault-switch behavior.

### AIP-302 - Update Owning Documentation

- **Description:** Record approved sidebar convention and implemented frontend projection.
- **Acceptance Criteria:**
  - [ ] `docs/DESIGN.md` documents control and motion after visual approval.
  - [ ] `docs/architecture.md` documents full/visible catalogs and per-vault preference.
  - [ ] No unrelated parser, database, configuration, or ADR contract changes.
- **Validation / Verification:** Inspect documentation diff and run formatting checks.

### AIP-303 - Run Complete Quality Gate

- **Description:** Run focused tests, complete frontend checks, Storybook/visual checks, complete Rust
  checks, and final diff review.
- **Acceptance Criteria:**
  - [ ] Frontend tests and build pass.
  - [ ] IPC generation check passes without unintended generated changes.
  - [ ] Storybook build and approved visual regression pass.
  - [ ] Rust formatting, Clippy, and tests pass.
  - [ ] Final diff contains only feature artifacts and approved code/documentation changes.
- **Validation / Verification:** Run commands listed in approved project definition and report exact
  results or environmental blockers.
