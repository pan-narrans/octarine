# Product Vision

## The Problem

Structured productivity applications provide rich task, calendar, and query interfaces, but often keep the authoritative data in proprietary services. Plaintext Markdown vaults provide durable ownership, offline access, scripting, and version control, but large vaults are harder to aggregate into responsive task-management views.

## The Goal

Octarine bridges those models: a local interface over human-readable Markdown.

The user's files remain authoritative. Octarine acts as an indexing and interaction companion, deriving structured views without requiring internal IDs or proprietary storage in the source notes.

## Product Principles

### Plaintext integrity

Markdown must remain understandable and useful without Octarine. Internal bookkeeping must not litter task text with opaque identifiers.

### Editor independence

Users may edit files through Octarine or another tool. External changes must be observed, indexed, and reconciled safely.

### Local ownership and privacy

Core desktop behavior works against user-selected local files without requiring a hosted account. Logs and diagnostics must avoid note contents and must not be uploaded automatically.

### Derived structure

SQLite and other indexes are replaceable representations of Markdown, not competing sources of truth.

### Safe mutation

Convenient UI edits must never justify silent data loss. Ambiguous or stale source edits fail visibly rather than overwriting uncertain content.

### Measured scalability

The architecture should support large vaults, but performance claims require reproducible measurement. Caching, batching, parallelism, and virtualization are tools to introduce when evidence supports them.
Accepted large-vault validation fixture contains 20,000 Markdown files and 2,000,000 indexed tasks,
averaging 100 tasks per file, on local SSD. Fixture size is a test contract, not a current performance
guarantee.

### Portable future

Mobile, browser, encrypted synchronization, and self-hosted relay designs are roadmap possibilities. They are not current product capabilities and must pass explicit architecture, security, and privacy review before implementation or promotion.
