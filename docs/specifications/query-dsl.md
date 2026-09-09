# Query DSL

This document defines the implemented filter subset. Unsupported syntax belongs in the roadmap until implemented and tested.

## Supported Expressions

- Boolean operators: `AND`, `OR`, and `NOT`.
- Parentheses.
- Hierarchical projects: `+work` matches `work` and descendants.
- Primary contexts: `@phone`.
- Tags: `#urgent`.
- Priority: `p:A` through `p:D`, with numeric equivalents.
- Comparisons on `due`, `status`, and `type` using `=`, `!=`, `<`, `<=`, `>`, or `>=`.
- Due values as ISO dates, `today`, or `tomorrow`.

Examples:

```text
status = todo AND +work
(due <= today OR p:A) AND NOT #blocked
type = event AND @office
status = deferred AND +work
```

Projects match the exact path or a slash-separated descendant.
Status values are `todo`, `doing`, `deferred`, `done`, and `cancelled`.
Context terms match only the first context token in source order. Later context tokens remain preserved but do not satisfy context filters.

## Embedded View Form

The parser records the contents of a `tasks-query` code block and extracts its title. The frontend currently reads the `filter:` line for task retrieval. Other view keys are not a stable implemented contract unless supported by code and tests.

## Not Currently Supported

- Scheduled-start comparisons with `s`.
- `CONTAINS` and `STARTSWITH`.
- `yesterday` and relative forms such as `+7d` or `-1w`.
- General grouping and sorting semantics.

## Compiler and Execution Boundary

The compiler tokenizes input, validates a complete expression tree, and emits SQL containing placeholders plus a separate list of bound values. Field and operator names come only from compiler-owned allowlists. Project, context, tag, priority, status, type, and date values are validated before execution, and task columns are qualified for joined queries.

Tests cover valid expressions, malformed grammar, invalid enum-like values, hierarchical project execution, and separation of user values from SQL text. Expand both grammar validation and execution tests whenever the language grows.
