# ADR 0011: Unified Vault and Task-Creation Routing

## Status

Approved

## Implementation Status

In progress. Configuration version 2, non-destructive journal migration, unified journal confinement,
and initial ignore-aware scanner/watcher foundation are implemented. Task creation and hierarchical
project rename must not be presented as implemented until their acceptance criteria pass.

## Context

Octarine currently configures vault and journal as independent filesystem roots. Task indexing and
watching cover vault only, so task syntax inside journal files does not participate in task views.
Creating tasks from application also requires predictable placement without making SQLite or UI state
authoritative.

Users want one local workspace containing notes, journals, projects, and inbox. Tasks created through
Octarine should route by explicit project metadata or configured unprojected default. Tasks authored
through another editor must remain where user placed them.

## Decision

### One capability root

One canonical vault directory is sole filesystem capability. Journal folder, project folder, and
inbox file are relative locations beneath vault. Paths are validated and resolved in Rust before any
read or mutation.

Configuration migration never moves files. Existing journal path already beneath vault converts to
relative folder. External journal path remains untouched and produces migration-required state until
user selects folder beneath vault.

### Indexing boundary

Task scanner and watcher consider every Markdown file beneath vault except:

- hidden files and files under hidden directories;
- paths matched by vault-root `.octarineignore`;
- paths reached through directory symlinks, which scanner never follows.

Ignored Markdown remains available in note tree and editor. Ignore rules affect task parsing,
indexing, and watcher intake, not note visibility.

### Creation routing

Rust resolves destination from validated task draft and current configuration:

- task with explicit project `work/project1` routes to
  `<vault>/<project-folder>/work/project1.md`;
- task without project routes to configured Daily note or Inbox destination.

Project file path does not imply project identity. Project-routed root task contains exactly one
explicit project token. Passive indexing never relocates task, even when task project metadata does
not match source path.

Missing destination folders and files may be created through validated destination template.
Existing files receive newest task after unique configured heading or HTML marker. Missing or
duplicate target falls back to EOF with warning. Explicit EOF insertion reports destination.

### Source safety

Markdown remains source of truth. Task creation uses atomic per-file replacement, direct target-file
reindexing, and one retry after concurrent destination change. Second conflict aborts without
overwriting external content.

Project change on existing root task is explicit confirmed operation that moves complete Markdown
subtree. Per-file writes may be atomic; cross-file or multi-file workflow cannot claim global
atomicity and must return recovery state after partial failure.

Hierarchical project rename belongs separate Block 2. It requires dedicated preflight and execution
ADR before implementation.

## Consequences

- Journal tasks become indexable once journal lives beneath vault.
- Vault relocation carries complete Octarine workspace.
- Configuration version changes and external-journal migration UI becomes required.
- Ignore behavior and symlink policy become part of public filesystem contract.
- Direct reindex avoids full vault scan on task creation.
- Users may intentionally keep project-tagged tasks in arbitrary notes; Octarine does not silently
  reorganize external edits.
- Cross-file move and later project rename require explicit partial-failure handling.
- First supported and manually verified release target is macOS. Linux and Windows remain future
  validation work.
