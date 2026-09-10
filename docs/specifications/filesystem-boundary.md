# Filesystem Capability Boundary

The configured vault and journal directories are capability roots. A frontend-provided path does not grant access by itself.

## Authorization Rules

- Configured roots are created if needed and stored in application state as canonical paths.
- Existing paths are canonicalized before use and must remain beneath an allowed root.
- A capability root itself cannot be deleted, renamed, read as a file, or overwritten.
- New paths authorize their existing canonical parent before a file or directory name is appended.
- Child names must be one normal path component; absolute names and traversal components are rejected.
- Symlinks that resolve outside an allowed root are rejected.

Task status, schedule, raw-block, file-tree, create, delete, and rename commands are restricted to the vault. File-content reads and writes accept paths in either the vault or journal. Selecting a new configured root is an explicit user action and establishes a new capability.

These checks are enforced in Rust. Frontend path construction is not a security boundary.

## Cross-file Task Mutations

Project-task moves write destination before guarded source removal and attempt bounded rollback only
when source removal fails. Project rename uses separate deterministic preflight and execution phases.
Native preflight discovers every non-ignored Markdown rewrite, project file/directory move, case-fold
collision, and source fingerprint. Execution accepts opaque current plan token, revalidates all known
sources before first mutation, then uses atomic per-file rewrites and filesystem rename operations.

Multi-file rename is not globally atomic. Partial failure returns redacted completed/pending work and
inspection paths, and never performs automatic rollback. Directory moves can relocate ignored files
without reading or modifying their content; directory symlinks are never followed.
