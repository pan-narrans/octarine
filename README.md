# Octarine 🌌

Octarine is a locally-hosted, plaintext-native central organization hub and task manager. It is designed to act as the cognitive center point for your personal or organizational workspace, merging the human-readable flexibility of standard Markdown with the strict, queryable metadata structure of specialized task management systems.

Unlike traditional productivity systems that lock your data into cloud databases, Octarine respects your files. Your **notes are the database**. You can scatter tasks, events, and custom views across any `.md` file in your local vault. Octarine parses, caches, and aggregates them in real-time into a modern, polished local dashboard.

---

## 🚀 Key Features

- **Markdown Interoperability:** Standard list items (`- [ ]`, `- [/]`, `- [x]`) are fully recognized. No data-lock-in or custom file formats.
- **Dedicated Calendar Events:** Special `[>]` checkbox marker identifies calendar events, enabling high-performance timeline views without scanning unrelated bullet points.
- **Hierarchical Projects & Autocomplete:** Nest projects using slash syntax (e.g., `+work/client/project-a`). Octarine provides deep autocomplete and handles hierarchical filtering out-of-the-box.
- **Real-Time Syncing (Tauri Events):** Edit a file in Obsidian, Vim, or VS Code, and the Octarine native dashboard updates in milliseconds via Rust system watchers.
- **Zero-Bloat Concurrency:** Leverages exact location and content hashing to ensure editing from the UI never corrupts or overwrites external manual edits.
- **Massive Vault Performance:** Employs a local SQLite read cache, scanning files on boot only if their filesystem modification timestamps (`mtime`) have changed.
- **Embedded Plaintext Queries:** Define custom views directly inside your Markdown files utilizing portable `tasks-query` codeblocks.
- **Local-First P2P Sync (v2.0):** Standardizes on E2EE peer-to-peer syncing using Yjs/Automerge CRDTs over libp2p mesh.

---

## 🛠️ Tech Stack

- **Frontend:** React (TypeScript) + Vite + Tailwind CSS.
- **Backend:** Tauri Native App Shell + Rust Core.
- **Core Libraries (Rust Core):**
  - File Watching: Native OS system events (`notify` crate)
  - Cache: Local SQL database (`rusqlite` / `sqlx`)
  - Inter-Process Communication: Tauri IPC and Event channels
- **Core Libraries (Frontend Client):**
  - Parser: AST-based (using `remark`/`markdown-it`)
  - Recurrence: `cron-parser` & `date-fns`

---

## 📖 Directory Structure

```
Octarine/
├── docs/                         # System Specifications & Manuals
│   ├── adr/                      # Architecture Decision Records
│   │   ├── 0001-core-task-and-event-syntax.md
│   │   ├── 0002-vault-storage-and-caching.md
│   │   ├── 0003-concurrency-and-task-identity.md
│   │   ├── 0004-plaintext-query-engine.md
│   │   ├── 0005-local-first-p2p-and-e2ee-sync.md
│   │   ├── 0006-hierarchical-kanban-navigation.md
│   │   ├── 0007-unified-rust-parser-wasm.md
│   │   ├── 0008-sqlite-wal-concurrency.md
│   │   ├── 0009-parallel-boot-indexing.md
│   │   └── 0010-frontend-virtualization-state.md
│   ├── vision.md                 # Why we are building Octarine
│   ├── architecture.md           # How Octarine is structured
│   ├── database-schema.md        # SQLite Schema specs
│   ├── parser-spec.md            # AST boundaries & line-shift specification
│   ├── query-dsl.md              # View query syntax & BNF specification
│   └── style-guides/             # Language Code Standards & Linters
│       ├── git.md                # Branch naming prefixes, conventional commits, worktree rules
│       ├── rust.md               # Clippy, rustfmt, and submodule testing standards
│       └── typescript.md         # ESLint, Prettier, and Zustand state standards
│
│
├── src/                          # FRONTEND: React Vite Web App
│   ├── main.tsx                  # React Entrypoint
│   └── components/               # Reactive visual widgets
│
├── src-tauri/                    # BACKEND: Tauri Native Rust Backend
│   ├── Cargo.toml                # Rust dependencies
│   └── src/                      # Rust Compiler context
│
├── shared/                       # Shared TypeScript typings
└── README.md                     # This file
```

---

## 🚦 Getting Started

Detailed startup instructions and developer guides will be added as we complete Phase 1 and 2 of implementation. Refer to `docs/architecture.md` for a deeper breakdown of system modules.
