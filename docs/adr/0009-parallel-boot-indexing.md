# ADR 0009: Parallel Boot Indexing and Batching

## Status

Proposed

## Implementation Status

Not started. Boot traversal and indexing are sequential, and startup currently rebuilds the core cache. The throughput and latency figures in this proposal are targets, not verified measurements.

## Context

When Octarine starts up, it must reconcile the local SQLite database cache with the current state of the Markdown vault files on disk. Accepted large-vault fixture contains 20,000 Markdown files and
2,000,000 indexed tasks, averaging 100 tasks per file, on local SSD. Vaults may grow beyond 50,000
files. Performing file metadata checks and database insertions sequentially is slow ($O(N)$), causing
long loading splash-screens on startup and blocking the user from immediate action.

Specifically:

1. Sequential filesystem traversing is bound by single-core disk system call speeds.
2. Writing parsed task records back to SQLite using individual `INSERT` transactions forces disk synchronization on every record, limiting performance to ~100 writes/second.

## Decision

We will design a highly parallelized boot indexing pipeline optimized for multi-core processors, leveraging transactional database batching:

### 1. Parallel Filesystem Traversal & Metadata Filtering

On native platforms (Desktop and Mobile), the startup routine will walk the workspace directories using the `rayon` (data-parallelism) and `walkdir` / `ignore` crates.

- The directory walk compiles filesystem metadata (e.g. `mtime` modification timestamps) in parallel across all available CPU threads.
- Files whose `mtime` matches the database cache are skipped immediately. Only modified or untracked files are queued for parsing.

### 2. Multi-threaded Parsing

Queue elements are distributed across a work-stealing thread pool. The raw Markdown of each modified file is parsed concurrently to extract structured tasks and events.

### 3. Web & Webview Web-Worker Fallback

On Web browsers (React SPA) and phone webviews where multi-threaded disk system access is unavailable, the walk and parsing functions are moved off the main UI thread into a dedicated **Web Worker**. This keeps the browser's main thread free to render the UI, avoiding frame drops during initial synchronization.

### 4. Transactional Batching

Parsed task rows are written to the SQLite cache in large batches inside a single, explicit database transaction (`BEGIN TRANSACTION; ... COMMIT;`):

- To prevent transaction overhead, write locks are held for up to 500 records or 50ms intervals.
- This transactional batching increases write speeds from ~100 writes/sec to **over 30,000 writes/sec**.

## Consequences

- **Positive:**
  - **Sub-Second Boot Time:** Scanning and incremental indexing of 50,000+ files takes less than 300 milliseconds on standard modern NVMe/SSD devices.
  - **Zero UI Blocking:** Both on native (due to separate OS threads) and web (due to Web Workers), the frontend UI renders instantly without waiting for the sync to complete.
- **Negative:**
  - Writing concurrently to SQLite is not supported natively. The parallel parsing threads must collect their structured task arrays into a single coordinator thread that performs sequential batched transactions against SQLite to avoid concurrency lock errors.

Accepted 20,000-file/2,000,000-task fixture must be measured separately from 50,000-file metadata-scan
target. Neither target is verified by this proposed ADR.
