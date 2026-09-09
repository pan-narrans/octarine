# SQLite Index Specification

SQLite is a derived local index. Markdown files remain authoritative and the index must be rebuildable.

The database file is `com.octarine.app/index.sqlite3` under the platform cache directory. A cache from an older location is not migrated; startup rebuilds the derived index from Markdown.

## Current Tables

- `files`: canonical path, modification time, and file-content hash.
- `tasks`: source location, raw block, hash, status/type, description, metadata, priority, parse errors, derived parent hash, and indexed primary context.
- `tags` and `task_tags`: normalized tag dictionary and task relationships.
- `contexts` and `task_contexts`: normalized context dictionary and source-ordered task relationships.
- `custom_views`: indexed `tasks-query` blocks.
- `merge_reviews`: reserved by a future sync ADR; it is not an implemented user feature.
- `cache_metadata`: schema and index-format versions used for cache lifecycle decisions.

Foreign keys are enabled. File deletion cascades to its task and custom-view rows. WAL mode is enabled for the database connection.

## Indexing

For one Markdown file:

1. Canonicalize the path.
2. Read metadata and content.
3. Calculate a content hash.
4. Skip parsing when cached modification time and content hash both match.
5. Parse the file.
6. In a transaction, upsert the file, replace its derived tasks/views, and insert tag/context relationships.

The first parsed context is copied to `tasks.primary_context`. Every context relationship stores its source position so task DTOs reconstruct all tokens in original order. Context queries use only `primary_context`; later tokens remain derived source metadata.

The boot sweep indexes Markdown files found recursively and removes cache records for missing files.

## Versioned Invalidation

Application startup retains core index rows when the stored schema and index-format versions match the running application. Missing or mismatched version metadata invalidates derived rows once; the boot sweep then rebuilds them from Markdown. Invalidating the cache also removes orphaned tag and context dictionary rows.

Increment `CACHE_SCHEMA_VERSION` when a physical schema change requires invalidation after its migration is applied. Increment `INDEX_FORMAT_VERSION` whenever parser or indexing semantics could change the meaning of existing rows.

## Durable Data Boundary

Do not place user-authored or irreplaceable state in disposable cache tables. Before merge review or other audit history becomes real user data, move it into separately migrated durable storage with explicit backup and retention behavior.
