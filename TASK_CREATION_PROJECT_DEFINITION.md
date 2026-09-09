# Project Definition: Task Creation and Project Organization

## 1. Executive Summary

### Overview

Add fast, safe task creation to Octarine while keeping Markdown authoritative. Users open a
compact global capture, type a task with optional inline metadata, inspect its resolved destination,
and create it. They may expand the capture into a shared structured task composer before saving.

Storage follows task metadata. A task with `+work/project1` is created in
`<vault>/<projects-folder>/work/project1.md`. A task without a project is created in the configured
daily note or inbox. Missing folders and files are created from destination-specific templates.

Project reassignment of an existing parent task moves its complete Markdown subtree after explicit
confirmation. Hierarchical project rename is a separate implementation block because it performs a
larger multi-file mutation.

### Target Audience

Primary user manages personal and professional work in one local Markdown vault and wants quick
capture without surrendering file ownership, editor independence, or predictable placement.

Primary job:

> Capture a task from anywhere in Octarine, know exactly where it will be stored, and recover safely
> from mistakes or concurrent external edits.

### Scope Boundary

#### Block 1 — Creation MVP

- One canonical vault contains notes, journals, projects, and inbox.
- Versioned configuration migrates from separate vault and journal roots without moving files.
- Every user-visible Markdown file under the vault participates in task indexing.
- Hidden files, hidden directories, and directory symlinks are skipped.
- Root `.octarineignore` supplies Gitignore-style indexing exclusions.
- Global `New task` button opens compact capture from every main application surface.
- Keyboard shortcut is deferred.
- Compact input accepts one task body with supported inline metadata and shows destination preview.
- Compact input rejects multiline input, leading checklist syntax, empty titles, invalid metadata,
  and multiple project tokens.
- Current project, context, or tag view pre-fills visible metadata chips.
- Explicit typed project replaces inherited project before creation and updates destination preview.
- Typed contexts and tags merge with inherited values and deduplicate.
- Expanded form is pre-filled from compact input and inherited metadata.
- Shared `TaskComposer` powers separate create and edit wrappers.
- Expanded form matches current task-editor field scope: title, notes, subtasks, status, priority,
  due date, duration/estimate, recurrence, projects, contexts, tags, and raw Markdown.
- Dedicated scheduled-start/event controls remain calendar-owned. Raw `s:` remains valid and changes
  preview classification to Event.
- Subtasks inherit parent project. Octarine rejects conflicting child project metadata during create
  and edit; externally authored conflicts remain preserved and produce a parse warning.
- Destination-specific inline templates and insertion settings exist for Inbox, Daily note, and
  Projects.
- Insertion modes are heading, HTML marker, or EOF. Newest task is inserted first after a unique
  heading or marker. Existing content is pushed down without active reordering.
- Missing or duplicate configured insertion targets fall back to EOF and show an informative warning.
- Explicit EOF insertion succeeds and reports destination.
- Project change on an existing parent task asks for confirmation and moves its complete Markdown
  subtree, including notes and nested subtasks.
- Creation returns direct indexed state, an `Open file` action, and conflict-safe `Undo`.
- One automatic insertion retry handles a concurrent external destination edit. Second conflict
  aborts visibly without overwriting external content.
- First supported and manually verified platform is macOS.
- Linux and Windows support claims are deferred.

#### Block 2 — Hierarchical Project Rename

- Rename project leaf or hierarchy segment.
- Rename matching project file and descendant directory structure.
- Rewrite matching `+project` tokens for exact project and descendants across non-ignored vault files.
- Move ordinary files contained by renamed project directories.
- Preserve Markdown links unchanged.
- Preflight collisions and stale sources before mutation.
- Support case-only rename through safe temporary paths.
- Report partial multi-file failure and recovery state honestly.

#### Out of Scope

- Passive relocation of tasks authored in arbitrary Markdown files.
- Automatic movement of journal files during configuration migration.
- One-off Inbox/Daily destination override during capture; configured default controls unprojected
  task destination.
- Dedicated event creation fields inside task composer.
- Keyboard shortcut for capture.
- Linux or Windows support claims in first release.
- Updating Markdown links during project rename.
- Stable opaque IDs written into Markdown.
- Hosted accounts, synchronization, telemetry, or network APIs.

## 2. Technical Architecture

### Tech Stack

| Layer         | Technology             | Role                                                                                |
| ------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| Desktop shell | Tauri 1.x              | Existing native filesystem and typed IPC boundary.                                  |
| Frontend      | React 18 + TypeScript  | Compact capture, shared composer, settings, previews, feedback.                     |
| State         | Zustand                | Existing task state plus bounded creation state and reconciliation.                 |
| Native domain | Rust                   | Canonical validation, parsing, serialization, routing, safe writes, Undo, indexing. |
| Derived index | SQLite WAL             | Disposable task/query cache; never source of truth.                                 |
| Visual review | Storybook + Playwright | Required rendered UI states and regression inspection.                              |

### System Design

1. Global capture receives current simple-view context: project, context, or tag.
2. Frontend displays inherited metadata as chips beside compact text input.
3. Native draft parser validates supported inline syntax and returns normalized preview data,
   classification, and resolved destination.
4. Expanded capture initializes shared `TaskComposer` from normalized draft. Create and Edit wrappers
   apply different policies around deletion, source identity, routing, and confirmation.
5. Create command revalidates draft and configuration in Rust. Frontend preview is informative, not
   authority.
6. Rust resolves destination beneath canonical vault root, verifies it is not ignored, creates
   missing folders, renders missing file from inline template, and inserts serialized Markdown.
7. Writer compares destination snapshot immediately before replacement. One changed-snapshot retry is
   allowed; repeated change returns structured conflict.
8. Successful write directly reindexes target file before returning created task and Undo receipt.
9. Watcher event is deduplicated against direct reindex/reconciliation.
10. Undo supplies receipt source information to guarded deletion. Missing, changed, or ambiguous
    source fails safely.
11. Editing an existing parent project uses a separate confirmed subtree-move command.

Passive indexing never relocates content. A task manually authored in `notes/meeting.md` remains
there, even when it contains `+work/project1`. Only Octarine creation routing and confirmed project
editing move content.

### Configuration Model

Configuration version increments from 1 to 2. One absolute vault capability replaces independent
vault and journal capabilities. Organizational destinations are relative to vault.

```typescript
type InsertionMode = "heading" | "marker" | "eof";
type UnprojectedDestination = "daily_note" | "inbox";

interface InsertionConfig {
  mode: InsertionMode;
  target?: string; // Required for heading and marker; absent for EOF.
}

interface DestinationTemplate {
  template: string; // Inline template text stored outside vault.
  insertion: InsertionConfig;
}

interface AppConfigV2 {
  version: 2;
  vault_dir: string;
  journal_folder: string; // Relative, default "journals".
  daily_filename_pattern: string; // Default "YYYY-MM-DD.md".
  project_folder: string; // Relative, default "projects".
  inbox_file: string; // Relative, default "inbox.md".
  default_unprojected_destination: UnprojectedDestination;
  templates: {
    inbox: DestinationTemplate;
    daily_note: DestinationTemplate;
    project: DestinationTemplate;
  };
  journal_migration?: {
    external_journal_dir: string;
  };
}
```

Relative paths reject absolute forms, `.`/`..` traversal, empty segments, symlink escape, and any
resolved location outside vault. Inbox, daily-note, and project destinations must not match
`.octarineignore`.

#### Migration

- Existing journal path inside vault converts to relative folder automatically.
- Existing journal path outside vault remains untouched.
- External journal disables journal surface and produces persistent migration banner.
- Remaining application surfaces stay usable.
- User selects folder inside vault or manually copies journal files, then confirms location.
- Previous configuration is retained for recovery.

### Ignore Contract

- `.octarineignore` lives at vault root and uses documented Gitignore-style syntax.
- Matching Markdown remains visible and editable in note tree.
- Parser, task indexer, and watcher ignore matching task content.
- Hidden files and directories are excluded by default.
- Directory symlinks are never traversed.
- Ignore-file changes trigger full index reconciliation without blocking main UI.
- Ignored files are never content-rewritten during project rename. Directory rename may relocate an
  ignored file physically when it sits inside renamed directory; its contents remain untouched.

### Template Contract

Templates live as inline configuration text, preventing template files from becoming indexed task
sources. Supported first-version placeholders:

```text
{{project}}       Full project path, such as work/project1
{{project_name}}  Leaf project name, such as project1
{{date}}          Local submission date, YYYY-MM-DD
{{datetime}}      Local submission timestamp
```

Unknown placeholders fail settings validation. Template rendering happens only when destination file
does not exist. Task insertion happens after rendering.

Configured heading or marker must match exactly once. One match inserts task immediately below
target. Zero or multiple matches append EOF and return warning. EOF mode appends task and returns
informational destination message. Insertion preserves existing line ending style and trailing
newline behavior where representable.

### Project Naming and Routing

`/` defines hierarchy. Each segment accepts Unicode letters, numbers, `_`, and `-`; spaces, dots,
empty segments, leading/trailing slash, and traversal segments are rejected. Names normalize to NFC.
Typed capitalization is preserved, but project identity and collision detection are case-insensitive.

Mapping examples:

```text
+work                 -> <vault>/<project-folder>/work.md
+work/project1        -> <vault>/<project-folder>/work/project1.md
+work/project1/client -> <vault>/<project-folder>/work/project1/client.md
```

Every project-routed root task receives exactly one explicit `+project` token. File path never acts as
implicit project metadata. Multiple project tokens block creation. Existing case-fold conflicts remain
readable but block create, move, and rename until resolved.

### Draft and IPC Models

Exact DTOs remain Rust-owned and generate TypeScript aliases.

```typescript
interface TaskDraft {
  title: string;
  notes: string;
  status: "todo" | "doing" | "deferred" | "done" | "cancelled";
  priority: "A" | "B" | "C" | "D" | null;
  dueDate: string | null;
  duration: string | null;
  recurrence: string | null;
  project: string | null;
  contexts: string[];
  tags: string[];
  subtasks: TaskDraft[];
  rawMarkdown: string;
}

interface CaptureContext {
  project: string | null;
  contexts: string[];
  tags: string[];
}

interface TaskDraftPreview {
  draft: TaskDraft;
  taskType: "task" | "event";
  destinationPath: string;
  inheritedProject: string | null;
}

type CreateWarningCode =
  "insertion_target_missing" | "insertion_target_ambiguous" | "appended_at_eof";

interface CreateTaskResult {
  task: Task;
  destinationPath: string;
  warning: { code: CreateWarningCode; message: string } | null;
  undoReceipt: {
    filePath: string;
    lineNumber: number;
    rawMarkdown: string;
    sourceFingerprint: string;
  };
}
```

Proposed native operations:

```text
preview_task_draft
create_task
undo_created_task
move_task_project
validate_task_creation_settings
```

Block 2 adds project-rename preflight and execution operations. No HTTP API exists.

### Shared Composer Boundary

`TaskComposer` owns form presentation, normalized draft editing, raw Markdown panel, field errors,
subtasks, and metadata controls. It does not own persistence.

`CreateTaskModal` owns destination preview, Create action, and field-local validation. It has no
Delete action. Project changes before first save reroute without confirmation because no durable
content has moved.

Application notification viewport owns operation results outside modal. Successful writes close
modal and show notification with Undo and Open file. EOF fallback uses informational notification;
ambiguous insertion uses warning. Write failure keeps modal and draft open while showing persistent
global error. If Markdown write succeeds but index refresh fails, modal closes and persistent warning
offers Retry refresh and Open file. Desktop notifications stack newest-first at top right; mobile
notifications span top below application header. At most three display concurrently.

`EditTaskModal` owns original source identity, Save, Delete, stale-source handling, and confirmed
project moves. Empty source never silently maps to deletion; deletion stays explicit.

### Context Inheritance

- Project view pre-fills project.
- Context view pre-fills one context.
- Tag view pre-fills one tag.
- Todo, Doing, custom-query, open-note, dashboard, and calendar views add no task metadata.
- Dashboard uses configured unprojected destination.
- Typed project replaces inherited project before creation.
- Typed contexts and tags merge with inherited values.
- Duplicate tokens collapse.
- Expanded form shows and permits removal of inherited values.

### Performance Contract

Baseline hardware uses local SSD and documented macOS test machine.

```text
Markdown files:             20,000
Indexed tasks:              200,000
Largest Markdown file:      20 MB
Typical destination file:   <= 2 MB

Open quick capture:         < 50 ms
Typing response:            < 16 ms per input update
Destination preview:        < 50 ms
Create typical task:        < 200 ms p95
Create in 20 MB file:       < 500 ms p95
Incremental reindex 2 MB:   < 250 ms p95
```

Creation reindexes one target file only and never performs full vault scan. Parsing and serialization
must not block UI thread. Startup reconciliation remains background work. Benchmark fixtures are
generated and reproducible. Results record machine, filesystem, build profile, fixture shape, and run
count.

## 3. Security, Authentication, and APIs

### Authentication

No authentication. Feature remains local-only.

### Filesystem Safety

- Canonical vault root is sole filesystem capability.
- Every read, create, rename, and write resolves beneath root before mutation.
- Directory symlinks are not traversed during indexing.
- Task creation, move, Undo, and project rename use guarded source matching and atomic per-file
  replacement.
- Multi-file operations preflight every known collision and source conflict.
- No multi-file operation claims global atomicity.
- Partial failure reports files written, files untouched, and recovery action without logging note
  contents or full filesystem paths.
- Diagnostics remain redacted.
- SQLite remains disposable and never leads Markdown state.

### Error Contract

Structured errors distinguish invalid draft, invalid configuration, ignored destination, path escape,
source missing, source changed, source ambiguous, destination collision, template failure, repeated
concurrent edit, and operational failure. Human-readable text is not used for programmatic branching.

### External APIs

No HTTP endpoints, external services, hosted accounts, or telemetry added. Frontend communicates only
through typed Tauri IPC.

## 4. Acceptance Criteria

### Creation MVP

1. User can open compact capture from every main application surface through global header button.
2. Current project, context, or tag view supplies visible inherited metadata; expanded form contains
   same values.
3. Supported inline metadata parses before write and updates destination preview.
4. Empty title, multiline compact input, leading checklist syntax, invalid metadata, and multiple
   projects block submission with field-level feedback.
5. Project task creates in canonical project file with one explicit project token.
6. Unprojected task creates in configured daily note or inbox.
7. Missing destination folders and files render from correct destination template.
8. Unique heading/marker receives newest task directly beneath it without reordering existing content.
9. Missing or duplicate insertion target falls back EOF and returns informative warning.
10. Explicit EOF insertion returns destination information.
11. External destination change receives one safe retry; repeated change aborts without overwrite.
12. Successful response contains directly indexed task exactly once despite watcher event.
13. Open action opens destination file.
14. Undo removes exact created subtree or fails safely on missing, changed, or ambiguous source.
15. Project change on existing parent requires confirmation and moves complete subtree.
16. Child task exposes inherited effective project; conflicting child project cannot be authored
    through structured UI.
17. Passive indexer never relocates externally authored task.
18. Hidden files, hidden directories, directory symlinks, and `.octarineignore` matches do not
    contribute tasks.
19. Ignore changes reconcile index; ignored Markdown remains visible in note tree.
20. External journal migration never moves user files automatically.
21. Feature satisfies accepted macOS performance budgets at doubled baseline scale.

### Project Rename Block

1. Exact project rename changes matching project file, task tokens, and descendant paths.
2. Parent hierarchy rename changes matching `.md` file plus directory and descendant project tokens.
3. Ordinary files under renamed directory move with directory.
4. Markdown links remain unchanged.
5. Case-fold and destination collisions block mutation during preflight.
6. Case-only rename succeeds safely on macOS.
7. Stale source aborts before mutation when detected during preflight.
8. Partial failure reports durable recovery details.

### Verification Strategy

- Rust parser/serializer tests cover compact input, metadata, Unicode NFC, multiple project rejection,
  child inheritance, raw `s:` classification, and exact round-trip boundaries.
- Rust routing tests cover Inbox, Daily note, hierarchical projects, ignored destinations, path
  traversal, hidden folders, and symlink escape.
- Rust writer tests cover new/existing files, every insertion mode, missing/duplicate targets,
  newest-first insertion, line endings, retry, repeated conflict, direct index, and Undo.
- Rust move tests cover parent notes, nested subtasks, inherited projects, stale source, destination
  failure, and partial recovery.
- Configuration tests cover v1-to-v2 migration, internal/external journal paths, backup retention,
  settings validation, template placeholders, and atomic saves.
- Ignore tests cover Gitignore syntax, watcher behavior, index reconciliation, hidden paths, and
  visible note-tree behavior.
- React tests cover global capture, inherited chips, token precedence, destination preview, expansion,
  field validation, duplicate submission prevention, notification feedback, Open, Undo, and conflict
  UI.
- Shared composer regression tests cover distinct Create and Edit policies.
- Storybook and Playwright cover compact default, inherited project/context/tag, validation error,
  expanded form, raw Markdown, event preview, saving, closed-modal success, EOF info,
  missing/duplicate warning, write error with retained modal, index-refresh partial success,
  notification stack, and narrow viewport states.
- Rendered Storybook inspection precedes app integration. Rendered application receives final visual
  inspection against acceptance criteria.
- Generated large-vault benchmarks enforce accepted macOS latency budgets on documented hardware.
- Manual smoke test runs on macOS. Linux and Windows remain unverified.
- Existing required frontend and Rust gates remain mandatory.

## 5. Documentation and Decision Updates

Implementation must update:

- `docs/specifications/configuration.md`: version 2 schema, migration, relative destinations,
  templates, insertion settings.
- New template specification: placeholders, examples, validation, insertion, fallback messages.
- `docs/specifications/task-syntax.md`: creation-input boundary and child project inheritance.
- `docs/specifications/filesystem-boundary.md`: unified vault, ignore rules, symlink behavior, routing,
  cross-file writes.
- `docs/architecture.md`: capture flow, shared composer, direct reindex, watcher deduplication, Undo.
- New `.octarineignore` specification: syntax, scope, reload, visible-note behavior.
- New ADR: unified vault and destination routing.
- New ADR: guarded multi-file task/project mutation before Block 2.
- `docs/DESIGN.md`: approved capture, destination preview, warning, and result patterns after visual
  approval.
- `docs/roadmap.md`: creation and rename milestones.
- User documentation: Settings examples, templates, migration, quick-capture syntax, project naming,
  Undo, and troubleshooting.

## 6. Explicit Assumptions

- “Task” means Markdown checklist item governed by existing canonical task syntax.
- Every matching checklist item in non-ignored, non-hidden Markdown is intentionally a task.
- First release is supported on macOS only.
- Local SSD is required for published performance budgets.
- Submission time in local system timezone determines `{{date}}`, `{{datetime}}`, and daily filename.
- Configured unprojected destination has no per-capture override in first release.
- Project file path does not imply project metadata; explicit `+project` remains required.
- Project change before initial creation reroutes without confirmation.
- Project change after creation requires confirmation and guarded subtree move.
- Subtasks inherit only project. Other metadata remains child-specific.
- Ignored file contents are outside Octarine mutation authority even during project rename.
- Existing user-owned `PROJECT_DEFINITION.md` describes Kanban work and remains untouched; this
  definition uses feature-specific filename to avoid collision.
