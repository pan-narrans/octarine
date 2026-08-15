# Rust Development Guide

This guide distinguishes current expectations from gates that become required after the quality-baseline change.

## Formatting and Linting

Target required commands:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
```

The current branch does not yet pass these checks. They become mandatory only after the focused baseline change makes them green and CI enforces them.

- Use standard `rustfmt` output.
- Resolve Clippy findings rather than suppressing them.
- A lint suppression requires a narrow scope and a comment explaining why the lint is inappropriate.

## Naming

- Modules, files, functions, and variables: `snake_case`.
- Structs, enums, and traits: `UpperCamelCase`.
- Constants and statics: `SCREAMING_SNAKE_CASE`.
- Prefer clear domain names over abbreviations.

## Errors

- Do not introduce `unwrap()`, `expect()`, or `panic!()` in recoverable runtime paths.
- They are acceptable in tests and genuinely unrecoverable startup invariants.
- Propagate recoverable errors with `Result` and `?`.
- Use structured error types when callers need to distinguish failure classes.
- Introduce `thiserror`, `anyhow`, or another dependency only when the error model benefits from it.
- Translate internal failures into stable, sanitized IPC errors at command boundaries.

## Concurrency and Performance

- Use standard-library primitives by default.
- Keep lock scope bounded and avoid locks across slow filesystem work where practical.
- Add `parking_lot`, Rayon, or other performance dependencies only for a measured need.
- Optimize allocation in measured parser/indexer hotspots, not through a blanket zero-copy rule.
- Do not publish performance claims without a reproducible benchmark.

## Boundaries

New backend work should move incrementally toward:

```text
commands → services → domain
                 ↓
          infrastructure
```

- Tauri commands are thin typed adapters.
- Domain parsing and source-edit rules do not depend on Tauri.
- Filesystem, database, configuration, and OS watcher code are infrastructure.
- Do not refactor unrelated modules solely to achieve the target tree.

## Tests

- Inline `#[cfg(test)] mod tests` modules are allowed for unit tests.
- Use `src-tauri/tests/` for black-box integration tests.
- Use unique temporary directories and databases; never touch real user data.
- Replace fixed sleeps with observable conditions and bounded timeouts.
- Bug fixes include regression coverage where practical.

See `testing.md` for the project-wide testing policy.
