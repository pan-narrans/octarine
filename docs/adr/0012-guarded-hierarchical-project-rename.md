# ADR 0012: Guarded Hierarchical Project Rename

## Status

Accepted

## Implementation Status

Implemented. Native planning, guarded execution, recovery reporting, typed IPC, approved Storybook
UI, and rendered macOS application verification are complete. Linux and Windows remain unverified.

## Context

Project identity lives in explicit task metadata while project files and directories provide
conventional storage. Renaming a hierarchical project can therefore affect independent Markdown
sources plus two filesystem shapes at once. For example, `work` may have both `work.md` and a
`work/` directory containing descendant projects and unrelated files.

A multi-file rename cannot be globally atomic on local filesystems. External editors can also change
planned sources between confirmation and execution. Rename needs complete preflight, guarded writes,
and useful recovery state instead of silent partial success.

## Decision

### Identity and rewrite scope

Project names retain the validation, NFC normalization, and full Unicode case-fold identity defined
by the project-name specification. Rename matches path segments, not raw string prefixes:

- `work` becomes `job`;
- `work/client` becomes `job/client` with descendant suffix unchanged;
- `workshop` and `work-client` remain unchanged.

Only explicit project tokens in parsed task metadata are rewritten. Root tasks keep one explicit
project token. Subtasks continue to inherit their parent project and are not given duplicate tokens.
Prose, code, comments, tags outside task metadata, and Markdown links remain unchanged.

### Filesystem mapping

Rename maps both possible source shapes beneath configured project folder:

```text
<project-folder>/work.md -> <project-folder>/job.md
<project-folder>/work/   -> <project-folder>/job/
```

Either source may exist independently or both may exist. Moving descendant directory also moves
ordinary files and nested directories within it without changing their contents.

Vault ignore rules control content rewriting and indexing. Ignored and hidden Markdown files never
enter rewrite plan, even when they contain old project token. If such file lives inside renamed
project directory, directory rename changes its filesystem path as part of that opaque directory
move, but file bytes remain untouched. Directory symlinks are never followed.

### Preflight

Rust creates deterministic, serializable plan before confirmation. Plan includes:

- normalized source and destination project names;
- every affected non-ignored Markdown source, source fingerprint, and rewrite count;
- exact project-file move and descendant-directory move when present;
- every destination or Unicode case-fold collision;
- aggregate task, file, and descendant impact;
- warning that Markdown links are not updated;
- opaque plan token bound to complete ordered plan.

Preflight performs no mutation. Any collision blocks execution. Source and destination with same
case-fold identity are allowed only for case-only rename of same project.

### Guarded execution

Execution accepts native plan token, not client-authored operation list. Rust resolves stored plan,
checks token and current configuration, obtains bounded mutation lock, and validates planned source
fingerprints before first mutation when possible. Stale or unknown plans fail before mutation.

Each Markdown rewrite uses atomic per-file replacement. Case-only filesystem rename uses unique
temporary sibling path so it works on case-insensitive macOS filesystems. Move ordering prevents one
planned source from overwriting another, and destination existence is checked again immediately
before mutation.

After filesystem work, SQLite index reconciles every affected non-ignored old and new path before
success is returned.

### Partial failure and recovery

No global atomicity is claimed. A failure after first completed operation returns structured recovery
report containing:

- completed operation descriptions and paths;
- pending operation descriptions and paths;
- current known filesystem state;
- files requiring reindex or manual inspection;
- concise recovery guidance safe to show without raw diagnostics.

Executor does not automatically move files back after partial rename. Automatic rollback could
overwrite external changes or create second failure. User keeps source-of-truth Markdown and receives
specific paths needed to finish or reverse operation manually. Next preflight inspects current disk
state rather than assuming prior plan remains valid.

## Consequences

- Parent rename updates exact and descendant task project identity consistently.
- Ordinary files follow renamed project directory while ignored contents and links remain byte-identical.
- Confirmation can show complete impact and block known collisions before mutation.
- Source fingerprints prevent detectable stale-plan writes.
- Per-file atomicity limits corruption, but interruption can leave intentionally reported mixed state.
- Rename work is serialized with other native task mutations for bounded consistency.
- First supported and manually verified platform remains macOS. Linux and Windows require later
  validation before support claims.
