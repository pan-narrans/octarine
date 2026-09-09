# Task Creation Service

Rust owns task preview, validation, destination resolution, Markdown mutation, direct indexing, and
Undo. Frontend destination preview is display-only and never authorizes filesystem access.

## Native Operations

```text
preview_task_draft(input, captureContext)
create_task(operationId, draft)
undo_created_task(receipt)
```

Preview parses compact canonical metadata, applies capture inheritance, validates project identity,
and returns resolved destination without creating directories or files.

Create revalidates current configuration and draft, resolves destination again, serializes canonical
Markdown, writes with one concurrent-edit retry, directly reindexes destination, then returns indexed
root task. Same operation ID returns cached result instead of duplicating Markdown.

Project task root contains one explicit `+project` token. Subtasks inherit project without redundant
tokens. Unprojected task routes to configured Inbox or Daily note destination.

## Write Safety

Missing destination uses rendered template and atomic no-clobber creation. Race with externally
created file retries through existing-file path. Existing destination writes through same-directory
temporary file, preserves permissions and line endings, and verifies source snapshot before atomic
replacement. First conflict rereads and reinserts. Second conflict fails without overwriting newer
content.

Markdown mutation precedes SQLite refresh. Success returns only after direct file reindex and indexed
root-task lookup. Index failure can leave Markdown ahead of disposable SQLite cache, never reverse.

## Undo

Receipt contains path, line, exact created subtree, and SHA-256 source fingerprint. Undo validates
fingerprint and vault boundary, locates exact block or one unambiguous nearby shifted block, removes
whole subtree, then directly reindexes. Missing, changed, or ambiguous source fails without deleting
uncertain content.

Diagnostics record stable event codes and generic messages. Task text, metadata values, and full paths
remain excluded.
