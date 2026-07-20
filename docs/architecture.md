# System Architecture & Organization

This document details how the Octarine codebase is logically separated, how data flows through the system, and how components interact in real-time.

---

## 1. System Overview & Data Flow

Octarine utilizes a **Tauri Server-Client architecture** designed for high-concurrency file tracking, zero-latency UI updates, and native desktop execution. 

```
                                      +------------------+
                                      |  Markdown Vault  |
                                      |  (.md Filesystem)|
                                      +--------+---------+
                                               |
                                               | (Local Read/Write)
                                               v
+------------------+   File Events    +--------+---------+
|                  |----------------->|                  |
|  External Editors|                  |   Tauri Backend  |
| (Obsidian / Vim) |<-----------------|   (Rust Core)    |
|                  |   Disk Sync      +----+----+--------+
+------------------+                       |    |
                                           |    | (SQL Indexing)
                        Tauri Events / IPC |    v
+------------------+    (Instant Sync)     |  +--------------+
|                  |<----------------------+  | SQLite Cache |
|  React Frontend  |                          |   (Local DB) |
| (Vite Dashboard) |------------------------> +--------------+
|                  |    Tauri Invoke Commands
+------------------+         (JSON/IPC)
```

---

## 2. Core Architectural Layers

### 2.1 The Sync & Watch Engine (Tauri Rust Core)
The backend is a high-performance native Rust application responsible for managing low-level system integrations.
- **File Watcher (`notify` crate):** Uses native operating system event systems (FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows) to monitor the Markdown Vault.
- **Safe Writer:** Implements the Strict Location and Content Hashing strategy (ADR 0003). When an action is taken on the React UI, the Rust backend attempts to edit the source file. If the file has changed externally in the interim, the operation is aborted, and Tauri broadcasts an event to the frontend to reload.
- **Tauri IPC Command Router:** Exposes asynchronous Rust commands to the React frontend via Tauri's high-speed JSON Inter-Process Communication (`invoke` handlers).

### 2.2 The SQLite Cache Layer (Rust Caching)
To ensure sub-millisecond loads and ultra-fast indexing, a local SQLite database caches parsed document metadata.
- **Engine:** Built with Rust's high-performance native SQL clients (`rusqlite` or `sqlx`).
- **Startup Scan:** Startup checks are executed in Rust. It compares filesystem modification timestamps (`mtime`) with cached SQLite records, rebuilding indices *only* for files modified since the last check.

### 2.3 The Markdown & Metadata Parser
The parser processes standard markdown files into structured task models.
- **Implementation:** Written as a pure, stateless Rust AST tokenizer utilizing high-performance parser primitives (e.g. `pulldown-cmark`). 
- **Compilation Targets:** 
  - **Native (Phase 1 / v2.0 Immediate):** Compiled to native binaries for Desktop (Tauri) and Mobile (Tauri Mobile) as our first-priority goal.
  - **WASM (Phase 2 / Deferred):** Compiled to WebAssembly (WASM via `wasm-pack`) for standard web/browser environments in a subsequent release.
- **Structure:** Multi-line tasks and parent/child lists are evaluated natively by mapping nested block nodes in the AST.

### 2.4 The Frontend Dashboard (React/Vite)
The UI is a fast, visually polished single-page application running inside Tauri's native WebView container.
- **Interactions & Gestures:** Fully responsive and touch-optimized, supporting interactive drag-to-reorder behaviors, swipe-to-complete, and native defer menus.
- **Tauri Event Bus:** Listens to Tauri-emitted Rust events (e.g. file changes, synchronization notices), updating the reactive state in real-time.

---

## 3. Directory Layout Guidelines

To support a seamless compilation workflow for Tauri, the codebase is structured with independent frontend and backend compilation peer folders:

```
/Users/a.perez/personal-projects/Octarine/
├── package.json                  # Frontend Web Dependencies & Workspaces
├── vite.config.ts                # Vite Configuration
├── tailwind.config.js            # Tailwind Utility Styling Rules
├── src/                          # FRONTEND: React Vite Web Code
│   ├── main.tsx                  # React Entrypoint
│   ├── components/               # UI widgets (Calendar, Tasks List, Gestures)
│   ├── hooks/                    # Tauri Event custom listeners
│   └── pages/                    # Main views (Home, Calendar, Custom views)
│
├── src-tauri/                    # BACKEND: Tauri Native Rust Backend
│   ├── Cargo.toml                # Rust Dependencies & Build Rules
│   └── src/                      # Rust Compiler context
│       ├── main.rs               # App Entrypoint & Command Registrations
│       ├── db.rs                 # SQLite Cache database connection & hooks
│       ├── parser.rs             # Stateless Markdown AST Parser Core
│       └── watcher.rs            # Native file monitor & Event bridge
│
└── shared/                       # Shared Types & Models
    └── types.ts                  # Shared TypeScript models
```

---

## 4. Multi-Platform & P2P Synchronization (v2.0 Path)

To ensure a smooth evolution to the v2.0 roadmap, v1.0 codebases strictly obey standard decoupling protocols.

### 4.1 Interface Decoupling (The Adapter Pattern)
The frontend application must never write files directly. It communicates with a stateless interface layer (`FileSystemAdapter`):
*   **v1.0 Implementation:** Invokes local Rust/Tauri native file-system handlers.
*   **v2.0 Implementation:** Overrides standard handlers with local browser OPFS APIs (Web Sandbox) or Yjs/Automerge CRDT synchronized state payloads.

### 4.2 Local Auto-Merge Auditing
While CRDTs guarantee conflict-free data resolution on reconnect in v2.0, the SQLite cache layer exposes a tracking index (`merge_reviews`) for auto-merged transactions. This stores visual text diffs of recent merge reconciliations, enabling users to audit, review, or manually roll back any overlapping peer-to-peer changes.
