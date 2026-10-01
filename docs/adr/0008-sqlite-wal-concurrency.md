# ADR 0008: SQLite Write-Ahead Logging (WAL) and Concurrency Tuning

## Status

Proposed

## Implementation Status

Partial. Native SQLite initialization enables WAL mode and foreign keys. The remaining tuning, multi-platform behavior, and performance claims have not been implemented or benchmarked.

## Context

Octarine utilizes a local SQLite read cache to support sub-millisecond view queries and Kanban loads.

In a local-first system, background file synchronization or live editor saves (via the `notify` file-system watcher) trigger rapid, frequent indexing writes. By default, SQLite operates in rollback journal mode, which locks the entire database file during a write operation. This database locking behavior causes noticeable UI stuttering or "database locked" errors when the frontend tries to query the task index while background indexing is active.

## Decision

We will configure the SQLite database connection to utilize **Write-Ahead Logging (WAL)** mode and optimize synchronous settings across all platforms (Native Desktop, Mobile, and WASM/OPFS).

Upon opening a connection to SQLite (both in Rust and WASM/JS environments), the application will immediately execute the following performance-tuning commands:

```sql
PRAGMA journal_mode = WAL;          -- Enable concurrent reads while writing
PRAGMA synchronous = NORMAL;         -- Optimize sync frequency without risking database corruption in WAL
PRAGMA temp_store = MEMORY;          -- Store temp tables and indexes in RAM to avoid disk I/O
PRAGMA cache_size = -64000;          -- Allocate 64MB of page cache (negative denotes Kibibytes)
PRAGMA foreign_keys = ON;            -- Enforce relational database constraints
```

## Consequences

- **Positive:**
  - **Non-Blocking Reads:** The React frontend can query tasks at 60fps even while the background Rust file watcher is bulk-indexing changes.
  - **Reduced Disk Write Overhead:** WAL mode performs sequential logging, which significantly reduces disk head movement and wear on local NVMe/SSD and mobile storage.
  - **High Performance in Browser:** SQLite WASM running over the Origin Private File System (OPFS) supports WAL-like high-speed concurrent execution natively.
- **Negative:**
  - WAL mode creates two temporary sibling files (`.db-wal` and `.db-shm`) next to the main database file. The backup/restore and clean-up mechanisms in the mobile and desktop apps must account for these sibling files during manual vault migrations.
