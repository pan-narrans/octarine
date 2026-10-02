# Workspace Density

**Status: CURRENT — 2026-10-02.** Storybook approval recorded; shared defaults promoted and rendered app verified.

Review the production components and named states in Storybook:

- `Workspace/Layout / Dashboard` — desktop dashboard at 1280×1024.
- `Workspace/Layout / TaskListAt1000` — task list and sidebar states at 1000×900.
- `Workspace/Layout / FullDocumentEditor` — file tree, document editor, and formatting toolbar at 1280×1024.
- `Workspace/Layout / FullDocumentEditorNarrow360` — document title, save actions, and formatting toolbar at 360×900 (`visual`).
- `Workspace/Layout / DeepTreeDrawerAt850` — selected inactive project, deep file tree, rename control, and open drawer at 850px.
- `Workspace/Layout / DashboardNarrow360` — dashboard at 360×900 (`visual`).

Approved layout conventions:

| Area                                       |   Approved value |
| ------------------------------------------ | ---------------: |
| Sidebar width                              |            232px |
| Main content inset                         |             24px |
| Sidebar section gap                        |             16px |
| Navigation row minimum height              |             32px |
| Project/file-tree indentation              |      12px / 16px |
| Sidebar controls                           | at least 24×24px |
| Main title                                 |      28px / 34px |
| Search control minimum height              |             36px |
| Editor header padding                      |         8px 12px |
| Editor formatting toolbar vertical padding |              4px |
| Compact task card padding                  |         8px 12px |

## Implemented shared decisions

`WorkspaceHeader` and `WorkspaceToolbar` now serve both App and review stories. `WorkspaceSidebarCollections` and `WorkspaceSidebarFooter` likewise reuse the actual journal, note, settings, and vault controls. SidebarNavigation, FileTree, TaskCard, Dashboard, and MarkdownEditor consume shared layout tokens in `src/styles.css`; the former duplicated condensed-card rules have one effective definition.

The `--workspace-*` tokens live in `:root` and define the single shared density for Storybook and App. The approved selectors now apply to normal component classes, and the app shell constrains its content column so the 232px sidebar and 24px inset match the reviewed composition. Hover file actions occupy a separate tray so they cannot intercept clicks on nested names.

## Verification before approval

At 1280×1024, identical dashboard fixtures measured 904px versus 1000px usable content width, six versus eight complete task cards before scrolling, and the first task starting 72.5px higher. Navigation rows measured 32px; Expand and Collapse controls measured 24px high with 12px labels.

Rendered review covered the desktop dashboard and full document editor, 1000px task list with selected inactive project and journal setup state, 850px drawer with expanded nested notes, and 360px dashboard/editor. Long editor titles no longer overlap Save and Close. Nested labels remain clickable while their actions appear below them. Drawer dismissal and project rename were inspected. The app's current 280px sidebar and 48px inset were also checked after extraction; New task opens capture and returns focus on dismissal.

Frontend IPC, formatting, lint, build, and unit tests passed before approval (130 tests). Storybook build and the targeted task-card/editor Playwright suites passed (31 tests). Independent final source review found no material regressions.

## Verification after promotion

Rendered app inspection confirmed the 232px sidebar and 24px main inset at desktop width, with no horizontal page overflow at 1000px or 360px. Dashboard, calendar, project board, settings, journal, and full note editor were inspected. The 360px note editor retained 509px of visible source area; metadata and actions had an 8px gap. Folder expansion and note selection worked, and drawer dismissal and task capture returned focus to their triggers. The canonical Storybook layout also measured the same 232px sidebar and 24px inset.

Frontend IPC, formatting, lint, build, unit tests (23 files, 130 tests), and Storybook build passed. The full Playwright suite passed all 142 tests after refreshing 36 approved density-affected baselines for Dashboard, FileTree, Kanban, MarkdownEditor, SidebarNavigation, and TaskCard. Modal baselines remained unchanged. Independent promotion review found no material regressions, including rendered deep file rename controls. Builds retain the existing large-chunk warning.

## Remaining opportunities and validation limits

Settings forms and calendar-specific chrome are possible later density refinements; their content-specific layout has not been redesigned here. Deep hierarchy labels still truncate within the navigation width rather than forcing overflow. Native Tauri behavior has not been validated by these browser fixtures.
