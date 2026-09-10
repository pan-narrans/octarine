# Project Rename Performance

## Reproduction

Run ignored release benchmark from `src-tauri`:

```sh
cargo test --release project_rename::tests::benchmark_large_vault_project_rename --lib -- --ignored --exact --nocapture
```

Fixture generation is excluded from measured intervals. Fixture contains 20,000 Markdown files in 200
directories, 10 indexed tasks per file, and 200,000 affected `+work/client` tokens. Preflight scans
complete fixture. Execution atomically rewrites and reindexes every file. This is worst-case affected
scope, not typical rename.

## macOS Measurement

Recorded 2026-09-10 on MacBook Pro Mac16,7, Apple M4 Pro (14 cores), 48 GB memory, macOS 26.6.2,
local SSD, release profile. One full run after warm compilation:

| Phase     | Time       |
| --------- | ---------- |
| Preflight | 2,241 ms   |
| Execute   | 183,537 ms |

Initial implementation executed one SQLite connection and transaction per affected file: preflight
2,325 ms, execute 201,634 ms. Batched reconciliation reduced execution by 18,097 ms (9.0%). Remaining
worst-case cost is dominated by 20,000 durable atomic file replacements and 200,000 task index writes.

Project rename has no accepted latency threshold. Task-creation latency budgets remain separate and
creation continues to reindex one destination file only. Linux and Windows results are unavailable.
