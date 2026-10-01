# `.octarineignore` Specification

`.octarineignore` controls task parsing and indexing beneath one Octarine vault. It lives at vault
root and uses Gitignore-style rules.

```gitignore
# Archived task sources
archives/

# Generated Markdown at any depth
generated/**/*.md

# Re-include one generated file
!generated/keep.md
```

## Scope

Matching Markdown:

- remains visible in note tree;
- remains readable and editable as note;
- does not contribute tasks or custom task views to SQLite;
- does not trigger task-index updates through watcher.

Changing, creating, or deleting `.octarineignore` rebuilds derived index membership before frontend
notification. No Markdown content is changed or deleted.

## Built-In Exclusions

Hidden files and directories are excluded from task indexing even without ignore rule. Directory
symlinks are never traversed. These rules prevent invisible tasks, traversal cycles, duplicate task
sources, and vault-boundary escape.

## Rule Behavior

- Rules resolve from vault root.
- Blank lines have no effect.
- Lines beginning with `#` are comments unless escaped according to Gitignore syntax.
- Trailing `/` matches directory.
- `*`, `?`, character classes, and `**` follow Gitignore glob behavior.
- Leading `!` negates earlier matching rule.
- Invalid rule rejects new matcher; current index remains active and diagnostic stays redacted.

Configured Inbox, Daily note, and Project destinations must not resolve to ignored or hidden path.
Destination validation belongs task-creation settings and writer boundary.
