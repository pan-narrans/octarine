# ADR 0004: Plaintext Query Engine for Custom Views

## Status
Approved

## Implementation Status
Partial. `tasks-query` blocks and a filter subset are implemented. Grouping, sorting, several documented operators/date forms, full grammar validation, and bound SQL parameters are not implemented. See `../specifications/query-dsl.md`.

## Context
The user needs the ability to create custom, tailored dashboard views (e.g., grouping by project, filtering by upcoming due dates). Defining these in a hidden backend configuration file reduces the portability of the system.

## Decision
Custom views will be defined directly in `.md` files using a specific markdown codeblock. 

```tasks-query
title: "Upcoming Work"
filter: "due <= today AND +work"
group_by: "project"
sort_by: "due asc"
```

1. **Parsing:** During the Vault scan (ADR-0002), the parser looks for `tasks-query` codeblocks.
2. **Registration:** These blocks are parsed into AST definitions and registered in the SQLite cache as available dashboard views.
3. **Execution:** When the frontend requests a view, the Rust backend (in v1.0 Desktop) or WASM SQLite driver (in Web) converts the declarative filters into a highly optimized, parameterized SQLite query against the cached task data, returning the filtered set.

## Consequences
- **Positive:** Views are highly portable and live alongside the user's notes. They can be version-controlled via git along with the vault.
- **Negative:** Requires building a translation layer (built into the core parser library) to convert the plaintext query syntax (`due <= today AND +work`) into safe SQLite queries.
