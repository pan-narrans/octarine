# Testing and Definition of Done

Verification effort is proportional to risk and affected scope.

## Isolation

- Tests must never read or modify a real vault, journal, application configuration, cache, or home directory.
- Use a unique temporary directory and database per test.
- Inject paths, clocks, and services where possible instead of relying on global process state.
- Timing-sensitive tests wait for an observable condition with a bounded timeout; a fixed sleep is not an assertion.

## Test Layers

- Rust unit tests cover parser tokens, query semantics, source matching, path authorization, configuration precedence, and migrations.
- Rust integration tests under `src-tauri/tests/` cover indexing, SQLite, safe writes, watcher lifecycle, and configuration migration across modules.
- Frontend tests, once configured, begin with pure feature logic, IPC adapters, and meaningful state transitions.
- Desktop end-to-end smoke tests are added during release preparation for first launch, vault selection, external edits, conflicts, and restart persistence.

A bug fix includes a test that fails before the fix and passes afterward unless automation is unreasonable. Explain any exception in the completion report.

Do not impose an arbitrary coverage percentage initially. Cover critical invariants and changed behavior; add a numeric threshold only after coverage measurement is stable and useful.

## Scope-Aware Checks

- Documentation-only: inspect links, commands, and formatting. Run builds if executable examples or configuration changed.
- Frontend: formatting and linting after configured, plus `npm run build`.
- Rust: formatting, Clippy, and tests.
- Parser/index: syntax fixtures, specification update, clean rebuild, and incremental indexing; increment index-format version when stored meaning changes.
- Database/configuration: forward migration and migration from the previous supported version; protect durable data from cache cleanup.
- Filesystem/watcher: allowed and rejected paths, symlink behavior, observable async outcomes, and indexing-before-notification.
- Cross-stack/release: all configured checks.

## Definition of Done

Every change:

- Satisfies agreed acceptance criteria.
- Contains no unrelated changes.
- Preserves existing user-owned work.
- Passes the checks for its affected area.
- Updates owning documentation when behavior, interfaces, commands, or invariants change.
- Reviews the final diff.
- Reports checks, failures, assumptions, and remaining risks.

GitHub Actions `Quality` workflow must run complete frontend, generated-contract, and Rust gates for
pull requests targeting `master` or `release/**`. Branch-model migration is incomplete until those
triggers are configured. Local verification remains required before opening a pull request.

Commits and external actions remain subject to explicit authorization; they are not part of the default definition of done.
