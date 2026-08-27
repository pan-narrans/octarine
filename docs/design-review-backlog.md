# Archived Design Review Notes

This file preserves historical OpenPencil review notes. As of 2026-08-26, OpenPencil is not part of the active visual-development workflow; Storybook is the sole component-design review source.

## Task modal — archived 2026-08-26

Recorded: 2026-08-22

Current overall status: **ARCHIVED**. The notes below are historical and do not create OpenPencil work or approval gates.

### Canonical OpenPencil document — resolved 2026-08-23

- `design/octarine.fig` is the canonical OpenPencil document for the task modal.
- The user deleted the previous blank file and renamed the working `design/octarine-recovered.fig` document to `design/octarine.fig`.
- The canonical document contains the `Task Modal`, `Responsive rules`, `Components`, and `Task card` pages and is tracked by Git.
- Future task-modal design work must not use this file as a design source or review gate.

### Modal geometry — resolved 2026-08-25

- The OpenPencil desktop source is explicitly labeled and sized at 860×820px.
- Its 1px border and 32px body padding produce the same 794px content width as Storybook.
- Header, body, and footer are fixed at 66px, 688px, and 66px; the body content uses responsive flex layouts.
- Field controls are 32px high, and title plus description remain one unified summary card.

### Reusable component masters — resolved 2026-08-25

- Context, project, and tag masters now match the composed modal in dimensions, 11px typography, borders, fills, and text colors.
- The labeled-field master uses the approved 32px control height.
- The subtask-row master now uses horizontal and vertical auto-layout instead of absolute text positioning.
- Storybook is the sole design authority; these masters are retained only as historical artifact content.

### Tokens, spacing, and contrast — foundation review pending

- The recovered file defines 31 variables but still contains unbound repeated colors and near-duplicate values.
- Task-modal gaps and padding now pass the 4px spacing-grid audit with no exceptions.
- Muted text contrast is 3.48:1 for `#6B7280` on `#111C38` and 3.87:1 on `#0B1126`, below the 4.5:1 target for normal text.
- Review the muted token in `src/styles.css` when addressing this contrast issue.

### Implementation maintenance

- Modal CSS is spread across repeated override blocks in `src/styles.css`. It currently renders correctly, but the cascade is fragile.
- Consolidate the modal rules only after design authority and final values are approved; preserve the visual baselines during the cleanup.
- Remove the untracked Vim swap file `src/components/.EditTaskModal.stories.tsx.swp` before preparing a change set.

### Current verification baseline

- `npm run visual:test`: 21 passed, including all 7 task-modal states and 12 task-card visual and interaction checks.
- `npm run build`: passed.
- `npm run storybook:build`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- Manual desktop, tablet, and mobile review passed for the joined title/description card, responsive fields/metadata, body scrolling, and mobile footer reflow.
