# ADR 0001: Core Task & Event Plaintext Syntax

## Status

Proposed

## Implementation Status

Partial. Checklist markers, inline metadata, multiline notes, and nested tasks are implemented through a source-preserving Rust scanner. The AST wording in this ADR is not the current implementation; see `../specifications/parser.md`.

## Context

The application needs a plaintext syntax that is both highly structured for querying and fully interoperable with standard Markdown tools (like Obsidian). Existing solutions like `todo.txt` lack native Markdown formatting, while standard Obsidian tasks lack rigorous, standardized metadata keys.

## Decision

We will use a hybrid syntax that leverages Markdown task lists as the foundation, augmented with strict key-value pairs for metadata.

1. **Prefixes:** Standard Markdown task lists will dictate state:
   - `- [ ]` (Not Started)
   - `- [/]` (In Progress)
   - `- [x]` (Completed)
   - `- [-]` (Cancelled)
   - `- [<]` (Event - explicitly marks the item as a Calendar Event, bypassing the need to parse all standard bullets).
2. **Multi-line Support:** Tasks will support standard Markdown indentation. The parser will capture the entire AST block, not just single lines.
3. **Tags:**
   - **Projects** are prefixed with `+` and support hierarchical paths (e.g., `+work/client/project-a`). Filtering for `+work` includes all descendants.
   - **Contexts** are prefixed with `@` (e.g., `@home`).
4. **Metadata Keys:**
   - `due:YYYY-MM-DD`
   - `s:YYYY-MM-DD HH:MM` (Scheduled start)
   - `dur:XhYm` (Duration)
   - `recurring:cron_or_natural` (e.g., `0 0 * * 0` or `every sunday`)
   - `when_done:<action>` (`delete` or `archive`). Dictates cleanup behavior upon completing a recurring task.

## Consequences

- **Positive:** Maximum compatibility with external Markdown editors. Clean, human-readable metadata. Clear distinction between tasks and events without parsing overhead.
- **Negative:** Requires a robust AST parser (like `remark` or `markdown-it`) rather than simple Regex line matching, increasing initial parser complexity.
