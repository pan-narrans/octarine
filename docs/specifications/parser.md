# Parser Contract

The current parser is a Rust source-preserving structural scanner, not a CommonMark AST parser.

## Input and Output

The parser accepts a file path and complete Markdown text and returns parsed tasks and custom views. It is deterministic for the same path and content.

Each task result includes source line, raw Markdown, an index hash, status, type, description, project, tags, contexts, scheduling fields, recurrence text, completion behavior, priority, parse errors, and a derived parent hash where applicable.

## Structural Scanning

The scanner tracks:

- One-based source lines.
- Indentation and parent checklist relationships.
- Fenced code-block boundaries.
- Block and inline Markdown comments.
- Indented multiline notes.
- `tasks-query` fenced blocks.

Exact source lines are retained because task-level mutations must match original plaintext.

## Metadata Extraction

Only the task header is used for inline metadata. Before token extraction, the parser removes or excludes link destinations, raw URLs, and code spans. It then extracts the syntax defined in `task-syntax.md`.

Invalid recognized metadata should not discard the task. The raw source remains available and parse problems are returned as structured data where implemented.

## Parent Relationships

The parser maintains an indentation stack. A nested checklist item receives the nearest less-indented task's hash as `parent_hash`. These relationships are derived cache data and may change when source location or content changes.

## Required Fixtures

Parser changes must cover:

- Every checklist status and event marker.
- Valid and invalid metadata.
- Unicode metadata.
- Links, raw URLs, and inline code.
- Fenced code blocks and comments.
- Multiline notes.
- Nested tasks and source lines.
- Custom query blocks.

## Safe-Write Boundary

The writer receives the original raw block with each edit, uses the expected location, and falls back to a nearby source search after line shifts. A fallback succeeds only when exactly one nearby block matches. Writes are independent of the SQLite cache and replace files atomically. Structured conflict responses remain planned hardening; see `architecture.md` and `roadmap.md`.
