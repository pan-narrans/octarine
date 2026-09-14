# Octarine Design System

This document describes conventions already observable in the current application. It is a living record, not a proposal for a redesign.

## Visual character

Octarine uses a dark, interstellar workspace aesthetic: deep navy surfaces, restrained translucent cards, and violet as the primary interactive accent. Color is used primarily to communicate state and metadata rather than as large decorative fields.

## Foundations

- **Typography:** system UI stack (`-apple-system`, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial); headings use tight negative letter spacing and strong weights.
- **Base surfaces:** `--bg-space` is the application canvas, `--bg-sidebar` is the navigation surface, and `--bg-card` is a subtle translucent elevated surface.
- **Text:** `--text-primary`, `--text-secondary`, and `--text-muted` establish the primary-to-tertiary hierarchy.
- **Accent and status colors:** violet/indigo are the primary accent family; emerald, amber, and rose communicate completion, caution, and due-state information. Priority badges use solid red, amber, blue, and slate treatments.
- **Borders and shadows:** low-contrast translucent borders (`--border-card`) separate surfaces. Violet glows are reserved for focus/active emphasis; task hover adds a restrained lifted shadow.

## Layout and spacing

- The desktop shell is a fixed-height, two-column layout with a 280px sidebar and scrollable main content.
- Sidebar content uses generous vertical sections; the main area uses a 48px outer inset. Lists and compact metadata use smaller repeated gaps.
- The shared spacing scale is 4, 8, 12, 16, 24, 32, and 48px. Use the corresponding `--space-*` custom property before introducing a new value.
- At the 1280×1024 visual-reference viewport, dashboard columns and cards are 420px wide with a 32px column gap. The journal editor is 904×220px.
- The month calendar uses seven 116×98px cells with 8px gutters. Its 860px grid intentionally leaves breathing room inside the 904px main content width.
- The desktop task modal is 860×820px, starts 90px from the top of the reference viewport, and keeps the complete structured form and footer visible.
- At 850px and below, the application sidebar collapses into an off-canvas drawer so the workspace owns the full width. A fixed menu control opens it; backdrop, Escape, or navigation closes it.

## Components and interaction

- Sidebar items are compact rounded rows. Active items use a violet-tinted surface and a violet left indicator; hover increases contrast without changing the overall dark language.
- Search and task cards use translucent surfaces with 1px borders and 12px radii. Focus states use the violet accent and glow.
- A task card's complete surface is the single entry point to the structured task editor, including keyboard activation with Enter or Space. Status controls remain independent and task cards do not expose a separate edit button.
- Shared radii are exposed as `--radius-control` (6px), `--radius-md` (8px), and `--radius-card`/`--radius-modal` (12px).
- Metadata on task cards appears as compact colored pills with subtle tinted fill/border. In the task editor, current context, project, and tag values sit beneath their add inputs as solid semantic-color capsules with dark, readable labels. Keep labels concise and preserve their established colors.
- Primary task checkboxes are circular; priority badges are compact square 4px-radius marks.
- Structured task editing groups each task title and description into one compact bordered card. Root task rows align to the form width; nested rows use a small inset while preserving the same typography, surface, and delete-control placement.
- The task editor keeps the title and description together in their shared compact card at desktop, tablet, and mobile breakpoints; responsive layout must not reintroduce a divider or separate input borders between them.
- The task editor uses the violet focus border and glow to identify the task or subtask that will receive a newly added child. With no explicit selection, new subtasks belong directly to the main task.
- Calendar, editor, modal, and drawer surfaces retain the same dark-surface, low-contrast-border, violet-accent family.
- Global `New task` action sits in main header across application surfaces. Compact capture expands in
  place to structured composer while preserving draft and inherited metadata.
- Operation feedback uses global notification viewport, not modal body. Desktop notifications stack
  newest-first at top right; narrow viewports span top below application header. Success and
  informational messages dismiss automatically, warnings remain longer, errors remain until
  dismissed. Maximum three render. Field validation remains adjacent to affected input.
- Successful task creation closes capture and returns focus to `New task`. Write failure keeps modal
  and draft open. Notification actions use compact text controls for Undo, Open file, and Retry
  refresh.
- Editing root project opens separate confirmation above task editor. Confirmation states source and
  destination projects, affected nested-task count, and both file paths. Cancel returns to unsaved
  editor. Successful move closes both modals; move warnings and errors use global notifications.
- Renaming project file or directory opens separate preflight confirmation. Summary states source and
  destination, rewritten task-token count, affected files, filesystem moves, descendant count, and
  non-updated-link warning. Collision disables confirmation. Partial failure replaces action view with
  completed/pending recovery report. Success closes modal and uses global notification viewport.
- Active or hovered sidebar project exposes compact pencil action. Inline editor changes one project
  segment with explicit confirm/cancel controls, then opens same project-rename preflight confirmation.
  Escape cancels inline editing; selected project follows successful hierarchy rename.
- Projects heading places compact `Show inactive` control opposite label. Sidebar hides projects with
  no `todo`, `doing`, or `deferred` items by default while retaining full project catalog in creation
  and editing surfaces. Active descendants retain hierarchy ancestors; selected inactive project
  remains visible until navigation leaves it.
- Sidebar project entry and removal uses 0.2-second opacity plus vertical collapse motion without
  horizontal movement. Reduced-motion preference suppresses transition.
- Rename into existing project offers merge. Merge uses explicit preflight, conflict resolution,
  preparation, and commit steps. Preparation remains cancellable without durable project changes.
  Commit can stop safely between file operations and never rolls back automatically. Successful and
  interrupted recovery bundles remain visible under Task settings.
- At narrow viewports, calendar controls stack while the seven-day calendar grid scrolls horizontally as a single bounded region. The day drawer is viewport-width constrained, and file-tree labels truncate rather than forcing page overflow.
- Project views place compact Board/List presentation switch beside search. Board is default; Done and Cancelled column toggles appear only in Board mode.
- Kanban columns keep fixed readable width and scroll inside board region instead of stacking or shrinking. Each column groups cards under flat uppercase context headings; No context appears first. Card context pills are omitted because group heading owns that information, while descendant project pills show only relative path.
- Kanban drop feedback states both status and context effect. Violet outline marks active target; pending cards fade and stop accepting repeat movement until native reconciliation completes.
- Motion is brief and understated (generally 0.2s) and reinforces hover, focus, and state changes rather than adding decoration.

## Maintenance

The concrete tokens and styles live in `src/styles.css`; components live in `src/`. Before creating a one-off visual value, check whether an existing token or component treatment applies. Add a rule here only after it is intentionally adopted and verified in the rendered application.
