# ADR 0013: Staged Project Merge

## Status

Accepted

## Implementation Status

Implemented. Native planning, cancellable staging, guarded commit, recovery, approved Storybook UI,
and automated macOS verification are complete. Manual macOS application testing remains release
validation; Linux validation remains later work.

## Context

Project rename currently blocks when destination identity or storage exists. Users need to consolidate
overlapping hierarchies without silent overwrite. Merge can affect project notes, arbitrary directory
contents, ignored opaque files, and task metadata across unrelated vault notes. Local filesystems offer
atomic replacement for one path, not one transaction spanning complete vault.

## Decision

Destination owns merged identity. Exact and descendant source projects map by path segment into
destination hierarchy. Matching destination descendants recursively merge. Lookalike prefixes remain
unchanged. Ancestor-to-descendant and descendant-to-ancestor merge are blocked because identity and
filesystem mapping are ambiguous.

Merge uses two explicit phases:

1. Dry run discovers both trees, fingerprints sources, resolves conflicts, validates Markdown, and
   materializes complete results under `.octarine/staging/<operation-id>/`. Cancellation during this
   phase changes no project data.
2. Commit acquires shared mutation lock, revalidates source state, moves displaced originals to
   `.octarine/recovery/<operation-id>/`, installs staged outputs atomically per file, removes source
   last, and reconciles SQLite.

Commit is not globally atomic. Stop request remains available, but takes effect only between atomic
operations. Current operation finishes. Stop or failure after mutation returns structured recovery
report; executor never rolls files back automatically.

Markdown conflicts use two-way resolver: rewritten source, unchanged destination, editable result.
Ordinary and ignored file conflicts require explicit source/destination/keep-both choice. Ignored
content is never previewed. Identical non-Markdown files auto-resolve to destination. Type mismatches
require individual resolution. Symlink anywhere inside involved tree blocks merge.

Successful recovery bundles expire after 30 days at next startup. Partial, stopped, and failed bundles
never expire automatically. Markdown links, wiki-links, embeds, and plain paths remain unchanged.

## Consequences

- User can inspect and cancel complete dry run without changing durable project data.
- Destination collision becomes intentional merge instead of overwrite or hard dead end.
- Original displaced files remain recoverable after commit.
- Global atomicity remains impossible; commit UI must state boundary and recovery semantics.
- Staging and recovery consume vault space and require strict path, symlink, privacy, and cleanup rules.
- First supported and verified platform remains macOS; Linux and Windows require later validation.
