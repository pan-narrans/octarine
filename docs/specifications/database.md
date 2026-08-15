# SQLite Index Specification

SQLite is a derived local index. Markdown files remain authoritative and the index must be rebuildable.

## Current Tables

- `files`: canonical path, modification time, and file-content hash.
- `tasks`: source location, raw block, hash, status/type, description, metadata, priority, parse errors, and derived parent hash.
- `tags` and `task_tags`: normalized tag dictionary and task relationships.
- `contexts` and `task_contexts`: normalized context dictionary and task relationships.
- `custom_views`: indexed `tasks-query` blocks.
- `merge_reviews`: reserved by a future sync ADR; it is not an implemented user feature.

Foreign keys are enabled. File deletion cascades to its task and custom-view rows. WAL mode is enabled for the database connection.

## Indexing

For one Markdown file:

1. Canonicalize the path.
2. Read metadata and content.
3. Calculate a content hash.
4. Skip parsing when cached modification time and content hash both match.
5. Parse the file.
6. In a transaction, upsert the file, replace its derived tasks/views, and insert tag/context relationships.

The boot sweep indexes Markdown files found recursively and removes cache records for missing files.

## Current Invalidation Limitation

Application startup currently deletes core index rows before the boot sweep, so incremental startup behavior is not active. The unconditional truncate is temporary technical debt.

The planned lifecycle stores separate schema and index-format versions. Schema migrations change physical structure; an index-format bump triggers a one-time rebuild when parser meaning changes. Orphaned tag and context dictionary rows must be cleaned where relevant.

## Durable Data Boundary

Do not place user-authored or irreplaceable state in disposable cache tables. Before merge review or other audit history becomes real user data, move it into separately migrated durable storage with explicit backup and retention behavior.
