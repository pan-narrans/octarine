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
- Current responsive rules at 850px and 560px target modal and form layout. The application shell does not yet define a responsive sidebar breakpoint, so treat shell responsiveness as an area that needs deliberate validation rather than an established behavior.

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
- At narrow viewports, calendar controls stack while the seven-day calendar grid scrolls horizontally as a single bounded region. The day drawer is viewport-width constrained, and file-tree labels truncate rather than forcing page overflow.
- Motion is brief and understated (generally 0.2s) and reinforces hover, focus, and state changes rather than adding decoration.

## Maintenance

The concrete tokens and styles live in `src/styles.css`; components live in `src/`. Before creating a one-off visual value, check whether an existing token or component treatment applies. Add a rule here only after it is intentionally adopted and verified in the rendered application.
