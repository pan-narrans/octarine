# Project Merge Project Definition

## 1. Executive Summary

### Overview

When project rename targets existing project identity or storage, Octarine offers guarded project
merge instead of blocking at collision. Destination remains canonical identity. Source project,
matching descendants, task metadata, project notes, and directory contents merge recursively through
staged dry run, explicit conflict resolution, validation, and guarded filesystem commit.

### Target Audience

Local-first Octarine user consolidating duplicate or overlapping project hierarchies without losing
Markdown, ordinary files, ignored files, or recovery context.

### Scope Boundary

In scope:

- Merge entry point from project-rename collision confirmation.
- Exact and descendant project identity collapse into existing destination.
- Recursive project-note and directory merge.
- Two-way Markdown merge editor and per-path non-Markdown resolution.
- Hidden staging and recovery bundles inside vault.
- Safe cancellation during dry run and safe stop during commit.
- Structured stale-plan, partial-failure, and recovery reporting.
- Successful-bundle cleanup after 30 days.
- macOS implementation and verification.

Out of scope:

- True three-way merge; no common ancestor exists.
- Whole-vault atomic commit.
- Automatic Git commits, branches, conflict markers, or dependency on Git.
- Automatic Markdown-link, wiki-link, embed, or plain-path rewriting.
- Automatic task or prose deduplication.
- Ancestor-to-descendant or descendant-to-ancestor merge.
- Symlink traversal or merge.
- Linux or Windows support claim.

## 2. Technical Architecture

### Tech Stack

| Area                  | Technology               | Reason                                                     |
| --------------------- | ------------------------ | ---------------------------------------------------------- |
| Durable data          | Markdown and vault files | Existing source-of-truth contract                          |
| Planning and mutation | Rust/Tauri service       | Canonical parsing, path security, filesystem ownership     |
| Derived state         | SQLite                   | Disposable task index; rebuilt after filesystem operations |
| Resolver UI           | React/TypeScript         | Existing application and Storybook workflow                |
| IPC contracts         | `ts-rs` generated DTOs   | Rust-owned structured interface                            |

No authentication, HTTP API, external service, or telemetry enters scope.

### Identity Semantics

Destination survives as canonical project identity. Merge matches project path segments:

```text
old             -> new
old/api         -> new/api
old/api/client  -> new/api/client
oldish          -> unchanged
```

When `new/api` already exists, `old/api` recursively merges into it. Corresponding project notes and
directories use same conflict contract. Source and destination containing each other is hard blocker;
user must first rename through unrelated temporary project.

All explicit source project tokens become destination tokens before Markdown resolution. Subtasks
retain inherited project behavior. Final result cannot contain source identity or invalid/conflicting
task project metadata.

### Filesystem Semantics

Project storage mappings remain conventional:

```text
<project_folder>/old.md -> existing <project_folder>/new.md
<project_folder>/old/   -> existing <project_folder>/new/
```

Non-conflicting entries move into destination. Same relative path becomes conflict. Ordinary files
never overwrite silently. Matching descendant projects merge recursively. Empty source project
directory is removed after durable destination writes; shared parents remain.

Any symlink inside source or destination merge tree blocks merge. Ignored files remain opaque:
resolver shows paths, never content. Non-conflicting ignored files move. Conflicting ignored files
support Keep destination, Use source, or Keep both with explicit new filename. Warning explains moved
paths may require `.octarineignore` update.

### Staged Dry Run

Prepare phase performs no user-file mutation:

1. Canonicalize vault and project folder.
2. Validate unrelated source/destination identities.
3. Discover source/destination trees without following symlinks.
4. Fingerprint every relevant source and destination.
5. Rewrite project metadata into staged Markdown results.
6. Build recursive collision and auto-resolution plan.
7. Resolve conflicts in UI.
8. Reparse and validate final Markdown.
9. Materialize complete outputs under `.octarine/staging/<operation-id>/`.

Cancel during this phase deletes staging only and guarantees no project data changed.

### Conflict Resolution

Markdown resolver shows rewritten source, unchanged destination, and editable final result. Actions:
Use source, Use destination, Combine both. Combined initial result is destination, separator, source.
Git conflict markers are never written. Duplicate tasks and prose remain unless user edits them.

Non-Markdown file conflicts support Keep destination, Use source, or Keep both with explicit safe
filename in same directory. Identical non-Markdown files auto-resolve to destination while source copy
enters recovery. Markdown never auto-deduplicates. File/directory type mismatches require individual
resolution and show entry type, nested file count, and size. Bulk source/destination actions exclude
type mismatches and directories and require second confirmation with affected count.

Every conflict remains unresolved by default. Merge cannot proceed until all conflicts have valid
choice. Choices persist in memory while confirmation flow remains open. Closing flow discards them.
Restart always requires new preflight.

### Guarded Commit

Final Commit boundary is explicit. Rust acquires shared task-mutation lock, validates staging outputs,
rechecks every source fingerprint and destination, then applies staged results using atomic per-file
replacement and filesystem rename. Originals displaced by conflict choices move into recovery before
replacement. Source removal happens only after destination content is durable.

Whole operation is not globally atomic. During commit, Cancel becomes Stop safely. Native executor
checks cancellation between atomic operations; current atomic operation finishes. Stop or failure
after mutation returns structured partial-recovery report. No automatic rollback occurs.

SQLite old paths are removed and final non-ignored paths reindexed after filesystem work. SQLite
failure never reverses Markdown state.

### Recovery and Cleanup

Recovery bundle path:

```text
.octarine/recovery/<operation-id>/
```

Original permissions are preserved. Manifest contains relative paths, hashes, entry types,
timestamps, selected resolutions, completed operations, and pending operations. Manifest excludes
task text and note content; recovered files naturally retain their contents. Path escape and symlink
entries are rejected.

Successful merge bundles expire 30 days after completion and delete during next application startup.
Success notification states deletion date and offers Open destination and Open recovery. Partial or
stopped operation bundles never expire automatically. Settings lists recovery date, summary, size,
Open, and Delete; Delete requires confirmation.

### Core Data Contracts

```typescript
type MergeEntryKind = "markdown" | "file" | "directory" | "ignored" | "type_mismatch";
type MergeResolution =
  | { action: "use_source" }
  | { action: "use_destination" }
  | { action: "combine"; result: string }
  | { action: "keep_both"; sourceName: string };

interface ProjectMergeConflict {
  id: string;
  relativePath: string;
  kind: MergeEntryKind;
  sourceFingerprint: string;
  destinationFingerprint: string;
  nestedFileCount: number;
  byteSize: number;
  resolution: MergeResolution | null;
}

interface ProjectMergePlan {
  planToken: string;
  operationId: string;
  sourceProject: string;
  destinationProject: string;
  conflicts: ProjectMergeConflict[];
  autoResolvedPaths: string[];
  rewrittenFiles: number;
  rewrittenTokens: number;
  collapsedDescendants: string[];
  warnings: string[];
}

interface ProjectMergeRecoveryReport {
  operationId: string;
  recoveryPath: string;
  completedOperations: string[];
  pendingOperations: string[];
  inspectPaths: string[];
  guidance: string;
}
```

Client submits conflict resolutions against native plan token. Client never supplies trusted absolute
paths or arbitrary operation ordering. Final native validation produces immutable commit plan.

### UI Workflow

```text
Rename collision
  -> Merge projects
  -> Merge preflight
  -> Resolve conflicts (when present)
  -> Validate staged result
  -> Commit merge
  -> Success or recovery
```

Conflict list is virtualized. Preflight and staging run outside UI thread, report progress, and allow
clean cancellation. No keystroke triggers vault scan. Busy mutation returns structured error and
preserves resolver state; merge is never silently queued.

If current view is source project or descendant, successful merge selects corresponding destination.
Other views remain unchanged. Markdown links, wiki-links, embeds, and plain paths remain unchanged and
are listed for manual review.

## 3. Security, Authentication, and APIs

### Authentication

None. Project merge is local-only.

### Filesystem Safety

- Canonical vault remains sole capability root.
- Hidden staging and recovery paths remain beneath vault.
- Native code validates every input path and resolution filename.
- Symlinks block merge and are never followed.
- Source/destination fingerprints prevent stale-plan mutation.
- Shared mutation lock serializes merge with creation, move, rename, Undo, and editor writes.
- Errors and manifests exclude task text, metadata values, and full external paths.

### IPC Commands

Planned typed commands:

```text
preflight_project_merge(source_project, destination_project)
resolve_project_merge_conflict(plan_token, conflict_id, resolution)
prepare_project_merge(plan_token)
execute_project_merge(plan_token)
cancel_project_merge(operation_id)
list_project_merge_recovery()
delete_project_merge_recovery(operation_id)
```

Structured error classes include invalid request, ancestor conflict, symlink blocked, unresolved
conflict, invalid result, path collision, stale plan, busy, cancelled, operation failure, partial
failure, and recovery failure.

## 4. Acceptance Criteria

1. Rename collision offers merge when destination identity or compatible storage exists.
2. Destination becomes canonical identity for exact and descendant source projects.
3. Matching descendants recursively merge; lookalike prefixes remain unchanged.
4. Ancestor/descendant identities and any involved symlink block before staging.
5. Dry-run cancellation changes no project data.
6. Every unresolved conflict blocks commit.
7. Markdown resolver produces exact validated output without Git markers or automatic deduplication.
8. Non-Markdown, ignored, identical, and type-mismatch entries follow accepted resolution rules.
9. External edit invalidates plan; manual result remains visible but requires review.
10. Commit moves displaced originals into recovery before replacement and removes source last.
11. Stop during commit returns durable partial-recovery report without automatic rollback.
12. Successful recovery bundles expire after 30 days; partial bundles do not.
13. Current source project view follows destination after success.
14. Links and path references remain unchanged with explicit warning.
15. UI stays responsive for 20,000 files and 2,000,000 indexed tasks (100 per file) on documented
    macOS SSD fixture.

## 5. Verification Strategy

- Rust planner tests: identity collapse, recursive descendants, lookalikes, ancestor block, case-fold
  collisions, ignored paths, symlinks, identical files, type mismatches, deterministic plans.
- Rust staging tests: metadata rewrite, Markdown validation, cancellation with zero mutation, stale
  fingerprints, safe filenames, manifest redaction, permission preservation.
- Rust executor tests: every resolution action, destination-first ordering, source-last removal,
  safe-stop boundaries, injected partial failure, restart reconciliation, 30-day cleanup exceptions.
- React tests: merge entry point, resolver state, bulk confirmation, progress, cancellation boundary,
  stale review, recovery actions, selected-project navigation.
- Storybook: merge offer, clean plan, unresolved conflicts, Markdown resolver, file conflict,
  type mismatch, staging, commit boundary, committing, cancelling, partial recovery, success, narrow
  viewport.
- Rendered macOS app smoke test: source/destination notes, recursive directories, ignored opaque
  content, external edit refusal, clean cancellation, successful merge, safe stop, recovery access.
- Release benchmark: 20,000 Markdown files, 2,000,000 indexed tasks (100 per file), recorded fixture
  shape, affected scope, run count, preflight/staging/commit measurements, and environment metadata.
- Linux and Windows remain unverified.
