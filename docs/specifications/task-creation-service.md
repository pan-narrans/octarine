# Task Creation Service

Rust owns task preview, validation, destination resolution, Markdown mutation, direct indexing, and
Undo. Frontend destination preview is display-only and never authorizes filesystem access.

## Native Operations

```text
preview_task_draft(input, captureContext)
create_task(operationId, draft)
undo_created_task(receipt)
move_task_project(sourceFilePath, originalLineNumber, originalRawMarkdown, newRawMarkdown)
```

Preview parses compact canonical metadata, applies capture inheritance, validates project identity,
and returns resolved destination without creating directories or files.

Create revalidates current configuration and draft, resolves destination again, serializes canonical
Markdown, writes with one concurrent-edit retry, directly reindexes destination, then returns indexed
root task. Same operation ID returns cached result instead of duplicating Markdown.

Project task root contains one explicit `+project` token. Subtasks inherit project without redundant
tokens. Unprojected task routes to configured Inbox or Daily note destination.

Project move accepts complete edited root subtree only after UI confirmation. Service validates exact
source subtree and new root project, resolves configured destination, writes destination first, then
removes source. Removing project uses configured unprojected route. Both files reindex before success.

## Write Safety

Missing destination uses rendered template and atomic no-clobber creation. Race with externally
created file retries through existing-file path. Existing destination writes through same-directory
temporary file, preserves permissions and line endings, and verifies source snapshot before atomic
replacement. First conflict rereads and reinserts. Second conflict fails without overwriting newer
content.

Markdown mutation precedes SQLite refresh. Success returns only after direct file reindex and indexed
root-task lookup. Index failure can leave Markdown ahead of disposable SQLite cache, never reverse.

Cross-file move never removes source before destination write succeeds. Source-removal failure
triggers guarded destination rollback. Failed rollback returns explicit recovery-required state because
task may remain in both files.

## Undo

Receipt contains path, line, exact created subtree, and SHA-256 source fingerprint. Undo validates
fingerprint and vault boundary, locates exact block or one unambiguous nearby shifted block, removes
whole subtree, then directly reindexes. Missing, changed, or ambiguous source fails without deleting
uncertain content.

Diagnostics record stable event codes and generic messages. Task text, metadata values, and full paths
remain excluded.
