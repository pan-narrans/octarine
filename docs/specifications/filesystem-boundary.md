# Filesystem Capability Boundary

The configured vault is sole filesystem capability root. Journal and project folders are configured locations beneath that vault. A frontend-provided path does not grant access by itself.

## Authorization Rules

- The configured vault is created if needed and stored in application state as a canonical path. Journal and project folders resolve beneath it.
- Existing paths are canonicalized before use and must remain beneath the configured vault.
- A capability root itself cannot be deleted, renamed, read as a file, or overwritten.
- New paths authorize their existing canonical parent before a file or directory name is appended.
- Child names must be one normal path component; absolute names and traversal components are rejected.
- Symlinks that resolve outside an allowed root are rejected.

Task status, schedule, raw-block, file-tree, create, delete, rename, and file-content commands are restricted to the vault. Selecting a new vault is an explicit user action and establishes the filesystem capability. Journal and project settings do not establish separate capabilities.

These checks are enforced in Rust. Frontend path construction is not a security boundary.

## Perspective Workspace Roots

Perspective file-tree configuration accepts logical IDs `vault`, `journal`, and `projects` only.
Rust resolves them from the active vault, the configured Journal folder, and the configured Project
folder. `Active Vault Path` in the sidebar selects the authorized vault; `Journal folder` and
`Project folder` in Task settings are relative to that vault. The Perspective file cannot grant
another root or supply an absolute path.

Every resolved Perspective root must remain beneath the canonical configured vault. An unavailable
Journal or Project folder is returned as unavailable and surfaced by the module; Rust does not
substitute a different root. Traversal and symlink escape checks run at native resolution. Tree
scans skip symlinked files and directories, matching task scanner policy. V1 does not support
arbitrary external roots or a separate authorization mechanism.

## Cross-file Task Mutations

Project-task moves write destination before guarded source removal and attempt bounded rollback only
when source removal fails. Project rename uses separate deterministic preflight and execution phases.
Native preflight discovers every non-ignored Markdown rewrite, project file/directory move, case-fold
collision, and source fingerprint. Execution accepts opaque current plan token, revalidates all known
sources and planned filesystem destinations before first mutation, then uses atomic per-file rewrites and filesystem rename operations.

Multi-file rename is not globally atomic. Partial failure returns redacted completed/pending work and
inspection paths, and never performs automatic rollback. Directory moves can relocate ignored files
without reading or modifying their content; directory symlinks are never followed.

## Guarded File Persistence

`write_file_content(path, content, originalContent)` requires the exact last-read/saved string for an
existing document. `originalContent: null` means create only; it never authorizes replacement.
Configured-vault authorization precedes access. Source is checked before staging and immediately
before atomic replacement; new-file installation uses no-clobber persistence. Existing permissions
are preserved. Structured `source_changed`, `source_missing`, or operational errors mean the write
was rejected; content remains available in the editor.

The boolean success result reports whether direct indexing succeeded. `false` still means Markdown
was saved; frontend advances its source snapshot and offers `reindex_file(path)`. That command only
refreshes derived state after native path authorization. Missing optional IPC preconditions default
to create-only behavior, so outdated clients cannot silently overwrite existing files.

Whole-file writes share the project/task-service mutation lock. Task writers also recheck their full
file snapshot at commit time. External processes do not share this lock: there is no claim of atomic
filesystem compare-and-swap or multi-file transaction.

Subtree replacements, deletion, and move preflight require every descendant being removed in the
original source block. Newly inserted children or indented notes cause `source_changed`; the writer
must not infer permission to delete them from an unchanged parent header.
