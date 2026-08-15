# Task Syntax

This is the authority for syntax implemented by the current Rust parser. Roadmap syntax must not be added here until implemented and tested.

## Checklist Markers

Tasks are Markdown list items with a recognized checkbox marker:

```markdown
- [ ] Todo
- [/] In progress
- [x] Done
- [-] Cancelled
- [<] Calendar event
```

Uppercase `[X]` is also accepted as done. A scheduled start (`s:`) causes an item to be treated as an event even when it uses a task marker.

`[>]` is not an Octarine event marker.

## Inline Metadata

Metadata appears on the first line of a task:

```markdown
- [ ] Prepare proposal +work/client @computer #urgent (A) due:2026-08-20
```

Supported forms:

| Meaning           | Form                | Example              |
| ----------------- | ------------------- | -------------------- |
| Project           | `+<path>`           | `+work/client-a`     |
| Context           | `@<name>`           | `@computer`          |
| Tag               | `#<name>`           | `#urgent`            |
| Priority          | `(A)` through `(D)` | `(A)`                |
| Due date          | `due:<YYYY-MM-DD>`  | `due:2026-08-20`     |
| Scheduled start   | `s:<date-time>`     | `s:2026-08-20 09:30` |
| Duration          | `dur:<duration>`    | `dur:1h30m`          |
| Recurrence text   | `recurring:<value>` | `recurring:weekly`   |
| Completion action | `when_done:<value>` | `when_done:archive`  |
| Completion date   | `done:<YYYY-MM-DD>` | `done:2026-08-20`    |

Some values accept single or double quotes. The parser validates known date, date-time, duration, and completion-action forms; unsupported values are preserved in raw Markdown and reported through parse errors where implemented.

The first project is the task's indexed project. Tags and contexts may contain letters, digits, underscores, hyphens, and slash-separated hierarchy.

## Multiline Tasks and Children

Indented non-task lines following a task are included in its raw Markdown notes. An indented checklist item is indexed as a separate task with a derived parent relationship.

```markdown
- [ ] Parent task +work
      Supporting note.
  - [ ] Child task
```

## Exclusion Zones

Octarine does not parse tasks inside fenced code blocks or block comments. Inline metadata extraction excludes Markdown link destinations, raw URLs, and inline code so their `+`, `@`, `#`, or `:` characters do not become task metadata.

## Embedded Views

A fenced `tasks-query` block is indexed as a custom view:

````markdown
```tasks-query
title: "Current work"
filter: "status = todo AND +work"
```
````

The supported filter subset is defined in `query-dsl.md`.
