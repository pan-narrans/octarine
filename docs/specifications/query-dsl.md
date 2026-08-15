# Query DSL

This document defines the implemented filter subset. Unsupported syntax belongs in the roadmap until implemented and tested.

## Supported Expressions

- Boolean operators: `AND`, `OR`, and `NOT`.
- Parentheses.
- Hierarchical projects: `+work` matches `work` and descendants.
- Contexts: `@phone`.
- Tags: `#urgent`.
- Priority: `p:A` through `p:D`, with numeric equivalents.
- Comparisons on `due`, `status`, and `type` using `=`, `!=`, `<`, `<=`, `>`, or `>=`.
- Due values as ISO dates, `today`, or `tomorrow`.

Examples:

```text
status = todo AND +work
(due <= today OR p:A) AND NOT #blocked
type = event AND @office
```

Projects match the exact path or a slash-separated descendant.

## Embedded View Form

The parser records the contents of a `tasks-query` code block and extracts its title. The frontend currently reads the `filter:` line for task retrieval. Other view keys are not a stable implemented contract unless supported by code and tests.

## Not Currently Supported

- Scheduled-start comparisons with `s`.
- `CONTAINS` and `STARTSWITH`.
- `yesterday` and relative forms such as `+7d` or `-1w`.
- General grouping and sorting semantics.

## Current Compiler Limitation

The current compiler tokenizes input and produces escaped SQL fragments. It does not yet build and validate a complete expression tree or return bound parameters. Tag and context filters also require fully qualified task identifiers when used with joined queries.

Before expanding the language, the compiler must produce a validated AST, qualified SQL, and bound values. Execution-level tests must cover valid expressions, invalid grammar, operator precedence, joins, and injection attempts.
