# Testing and Definition of Done

Protect durable Markdown and observable behavior rather than chasing a coverage percentage.
Rust owns canonical syntax, validation, indexing, and writes. Frontend tests exercise presentation,
IPC contracts, and state transitions without establishing a competing Markdown parser.

## Commands and Gates

Required frontend gate, from repository root:

```bash
npm run ipc:check
npm run format:check
npm run lint
npm run build
npm test
```

Required Rust gate, from `src-tauri/`:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

Useful focused commands, from repository root:

```bash
npx vitest run src/hooks/use-task-store.test.ts
cargo test --manifest-path src-tauri/Cargo.toml --test data_integrity
cargo test --manifest-path src-tauri/Cargo.toml watcher::tests::deterministic --lib
npm run visual:test -- tests/visual/markdown-editor-behavior.spec.ts --workers=1
```

`npm test` runs fast Vitest tests under `src/`. `npm run visual:test` starts Storybook and runs
Playwright component behavior and approved screenshot tests. Chromium must be installed through
`npx playwright install chromium`; browser tests require localhost binding. Keep this heavier tier
separate from the fast Vitest loop. Screenshot updates require the approval described in
`../visual-development.md`; behavior tests use explicit assertions and do not update baselines.

GitHub Actions `Quality` runs frontend tests in its quality job, all Rust targets in the same job,
and the complete Playwright suite in its macOS visual job. These run for `master` and `release/**`
pull requests and pushes. No additional framework or coverage threshold is required.

## Coverage Map

| Layer / subsystem                   | Existing protection                                                                                                                                                                               | Important limits                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Rust unit/domain                    | Inline tests for parser exclusion zones, statuses, metadata, query compiler, project identity, path authorization, configuration, templates, diagnostics                                          | Structural scanner is not a complete CommonMark parser; extend explicit fixtures for new syntax                           |
| Rust filesystem/service integration | Inline module tests use real temporary files and SQLite for create/Undo, subtree moves, rename, merge, index migration and ignore rules                                                           | Module location does not make these pure unit tests; race and fault coverage remains selective                            |
| Public cross-module integration     | `src-tauri/tests/`: parser/writer round-trips, guarded deletion, stale rename/merge, merge failures, guarded file persistence, corrupt-cache recovery, fresh-cache rebuild after external changes | Tests call Rust domain boundaries without running Tauri desktop shell                                                     |
| Watchers                            | Synchronous injected event sequences in `watcher.rs`; separate `PollWatcher` integration checks for creation and ignore reload                                                                    | Channel shutdown and directory events are tested; PollWatcher does not prove native delivery or watcher replacement       |
| Frontend unit/state                 | Colocated Vitest suites for Kanban projection/preferences/moves, task store and capture controller, notifications, navigation, settings, updates                                                  | Some hook/controller tests mock React wiring; pure model tests named after components do not constitute rendered coverage |
| Component/UI                        | Playwright renders real Storybook components; editor behavior asserts dirty, rejected save, retry, reopen, external refresh, and pending-save/document-switch races                               | Most existing specs are screenshots, not interaction tests; controlled persistence callback is not a native filesystem    |
| IPC boundary                        | Vitest adapter tests validate command payloads, runtime guards, and structured errors; `ipc:check` checks Rust-generated DTOs                                                                     | Mocked invoke does not prove command registration, path enforcement, or desktop event wiring                              |
| Desktop end-to-end                  | Release smoke procedures exist                                                                                                                                                                    | No automated native desktop end-to-end suite; browser fixtures cannot prove native restart persistence                    |

Rename coverage includes successful token/path/index changes, validation/collisions, stale sources,
late destination collisions, and injected partial failure. Merge coverage includes preparation,
cancellation, conflict resolution, stale sources/destinations, safe stop, originals recovery,
retention, and SQLite failure after durable commit. Task moves cover destination failure, guarded
source removal, successful rollback, failed rollback recovery, and complete subtree movement.
Deletion covers ambiguous/stale rejection and successful subtree removal followed by reindexing.

SQLite tests cover startup reuse, content-based incremental updates, version invalidation, context
migration, missing-file cleanup, and a fresh database matching incremental task DTOs. Startup recovery covers positively identified SQLite corruption and retains originals. Arbitrary
incorrect rows in a readable database are not automatically detected; explicit version invalidation
is covered by stale task/view regression tests.

## Placement and Naming

- Frontend pure logic, stores, and IPC adapters: colocate `*.test.ts` with their feature. Use names
  describing user action, failure condition, and observable outcome. Reset mocks and store state.
- Rendered interactions: `tests/visual/*-behavior.spec.ts`, using actual components in Storybook.
  Keep deterministic callback harnesses in component stories, tagged `visual` to hide mechanical
  states from the default sidebar. Mock the save/IPC boundary, not editor or React internals.
- Rust pure functions: inline `#[cfg(test)] mod tests`. Public multi-module behavior belongs in
  `src-tauri/tests/`. Keep private race/fault injection beside the implementation when exposing a
  production API only for tests would add unnecessary surface.
- Name Rust tests for guarantees, such as `rename_revalidates_every_source_before_first_write`.
  Add an issue reference when one exists; a clear invariant and owning specification suffice otherwise.
- Assert returned domain values, exact source preservation, and visible UI states. Avoid snapshots of
  implementation structure. SQL fault injection is appropriate for cache failures; ordinary integration
  assertions prefer `query_tasks` DTOs over internal row IDs or exact table layouts.
- Do not duplicate exhaustive Rust metadata validation in frontend tests. Frontend builders provide
  valid DTOs and targeted overrides; Rust fixtures establish canonical meaning.

## Isolation and Fixtures

Tests must never read or mutate real vaults, journals, configuration, caches, or home directories.
Use one `tempfile::TempDir` and real SQLite database per Rust scenario; put the database outside the
vault. Keep connections and directory owners alive for the complete test. Avoid environment mutation.

`src-tauri/tests/support/mod.rs` provides a small vault builder, public task-query helper, and complete
file-byte capture for no-mutation assertions. `Vault::new()` supplies a minimal empty vault;
`Vault::representative()` copies the explicitly listed Markdown fixtures before indexing them.

`src-tauri/tests/fixtures/vault/` owns a small readable corpus: Unicode notes, nested project tasks,
metadata exclusion zones, an embedded query, and malformed capture. Do not format fixture Markdown:
whitespace and bytes are inputs, so this directory is excluded from Prettier. Generate LF/CRLF and
final-newline variants within tests instead of storing opaque duplicate files. Build rename/merge
and external-edit scenarios by applying small explicit changes to these fixtures.

Use synchronous watcher reconciliation for event ordering, duplicates, deletion, own writes, rename,
and transient read failure. Real watcher tests wait on notification channels with bounded timeouts;
never use arbitrary sleeps. Avoid exact notification counts because native providers may coalesce
or duplicate events. Assert indexed state at notification time instead.

## Prioritized Remaining Work

1. Editor navigation: persisted drafts or explicit unsaved-navigation confirmation. Pending-save
   acknowledgements are isolated now, but leaving an unsaved document can still discard its buffer.
2. Destructive races: case-only filesystem collisions and external changes during the final
   validation/replacement window. Guarded commits and unseen-child rejection reduce risk; existing
   per-file atomic writes remain neither a global transaction nor filesystem compare-and-swap.
3. Watcher lifecycle: platform-native delivery, configured-root replacement, root disappearance,
   and bounded recovery after missed events. Deterministic directory, symlink, and channel-shutdown
   tests do not establish these platform guarantees.
4. Cache recovery: broader supported-schema migration fixtures, SQLite page corruption variants,
   and incomplete backup/cleanup failures. Current corruption recovery and stale task/view
   invalidation are automated; arbitrary valid-schema row corruption is not auto-detected.
5. Rendered critical workflows: merge/rename confirmation and recovery actions, keyboard/task
   interactions, loading/empty/error states, and native IPC integration.
6. Native desktop smoke automation: external edits, restart, configured-root changes, and conflict
   feedback on supported operating systems.

Persisted drafts, crash/session recovery, autosave, and unsaved-navigation confirmation are absent.
Tests for those guarantees require implementation first. Existing fixtures, browser callback harness,
and synchronous event seam are reusable infrastructure, not evidence that those features exist.

## Scope-Aware Definition of Done

- Run affected tests first, then applicable gates above. Cross-stack changes run both full gates.
- Parser/index changes exercise fixtures, incremental indexing, and clean rebuilds. Increment index
  format version when stored meaning changes; writer-only preservation fixes do not change index meaning.
- Filesystem changes exercise successful writes, rejected writes with unchanged source, and relevant
  partial-failure recovery. UI behavior changes use rendered component assertions.
- Documentation-only changes need formatting and link/command review.
- Preserve unrelated user work, inspect final diff, update owning behavior specifications, and report
  actual checks plus remaining gaps. Never hide failures or claim unrun checks passed.

Every `v*` tag requires successful Quality and Security checks on its target commit. Commits and
external actions require explicit authorization and are not part of the default definition of done.
