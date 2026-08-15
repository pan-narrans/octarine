# ADR 0002: Vault Storage & SQLite Caching Strategy

## Status

Approved

## Implementation Status

Partial. Markdown is authoritative and SQLite indexing plus native watching exist. Startup currently clears core cache tables before sweeping, so the approved incremental-startup behavior is not active. Versioned invalidation is planned in `../roadmap.md`.

## Context

The application is designed to operate on a "Vault" of Markdown files. Users may have massive vaults (10,000+ files). Parsing the entire vault on application startup using AST parsers is computationally expensive and slow.

## Decision

We will implement a high-performance, hybrid storage architecture using a native Tauri + Rust core from Day One (v1.0):

1. **Source of Truth:** The decentralized `.md` files on the filesystem remain the absolute source of truth.
2. **SQLite Cache:** A local SQLite database managed in Rust (`rusqlite` or `sqlx`) will be used strictly as a high-speed read cache.
3. **Startup Scan:** On application boot, the Rust engine will query the filesystem for modification timestamps. It will only parse files whose `mtime` is newer than the last sync timestamp recorded in the SQLite cache.
4. **Live Sync Watcher:** A native Rust watcher (using the `notify` crate) monitors the vault in the background. It taps directly into operating-system level file event hooks (FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows). Changes trigger immediate, targeted re-parsing of the affected file, updating the SQLite cache, and emitting a Tauri event to the React frontend.

## Consequences

- **Positive:** Near-instantaneous startup times even for massive vaults. The UI remains highly responsive as queries hit SQLite rather than the filesystem.
- **Positive:** Rust's native file watching has a zero-overhead footprint and resolves the memory leakage/file limits occasionally present in Node-based watchers.
- **Negative:** Adds infrastructure complexity. The cache must be carefully managed to ensure it never falls out of sync with the filesystem across desktop and mobile containers.
- **v2.0 Compatibility:** Decoupling the indexing engine into Rust from day one allows the same codebase to easily expand to WebAssembly (WASM SQLite) on the web, and mobile databases on Android/iOS.
