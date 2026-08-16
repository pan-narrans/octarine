# Architectural Safeguards

These rules preserve lessons learned from concrete failures. They are project-specific invariants, not general style preferences.

## Canonicalize Paths at Boundaries

Filesystem scans and native watcher events can represent the same file differently. Canonicalize paths before database comparison, indexing, or mutation so one source file cannot create duplicate cache records.

Path authorization must ensure canonical paths remain inside the configured vault or journal root and reject traversal, capability-root mutation, and symlink escapes. New destinations must validate their existing canonical parent before creation or rename.

## Sanitize Metadata Extraction

Before extracting projects, contexts, tags, or key-value metadata, exclude Markdown link destinations, raw URLs, code spans, fenced code blocks, and comments. URL characters such as `+`, `@`, and `#` are not task metadata.

Parser changes require regression fixtures for both positive syntax and exclusion zones.

## Version Indexed Meaning

File timestamps alone cannot invalidate data produced by an older parser. Changes that alter stored interpretation must increment an index-format version and trigger a one-time rebuild. Do not use an unconditional startup truncate as the permanent invalidation strategy.

## Preserve Source Preconditions

A task edit must carry the original source block supplied to the user. Do not rely on SQLite to reconstruct that precondition after a watcher may have reindexed the file. Apply a shifted edit only when exactly one source match is found.

## Preserve Existing Work

Before replacing a large file, inspect current status and diff. Prefer focused edits so concurrent or recently removed behavior is not accidentally reintroduced.
