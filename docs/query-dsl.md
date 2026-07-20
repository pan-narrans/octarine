# Query Domain-Specific Language (DSL) Specification

Octarine custom views are defined natively in markdown notes using a `tasks-query` codeblock. This document defines the grammar, operators, and relative date keywords of the search language.

---

## 1. Codeblock Schema

A view block uses standard YAML configuration formatting to define parameters:

```yaml
title: "Upcoming Project Work"
filter: "due <= today AND +work/client AND (tag = #urgent OR tag = #high)"
group_by: "project"
sort_by: "due_date asc"
```

---

## 2. Formal Filter Grammar

The `filter` string is parsed into an abstract query representation that translates to SQL syntax.

```
Expression    ::= Term ( "OR" Term )*
Term          ::= Factor ( "AND" Factor )*
Factor        ::= Primary | "NOT" Factor | "(" Expression ")"
Primary       ::= KeyComparison | TagMatch | ProjectMatch
KeyComparison ::= Key Operator Value
Operator      ::= "=" | "!=" | "<" | "<=" | ">" | ">=" | "CONTAINS" | "STARTSWITH"
Key           ::= "due" | "s" | "status" | "type"
Value         ::= StringLiteral | DateKeyword | DateLiteral
TagMatch      ::= "tag" "=" TagLiteral | "context" "=" ContextLiteral
ProjectMatch  ::= "+" ProjectPath
```

---

## 3. Relative Date Evaluator

To ensure custom views are dynamic, relative date keywords are resolved dynamically on execution:

- **`today`**: Resolves to the current system date (`YYYY-MM-DD`).
- **`tomorrow`**: Resolves to `today + 1 day`.
- **`yesterday`**: Resolves to `today - 1 day`.
- **`+Xd` / `-Xd`**: Resolves to today plus or minus X days (e.g., `+7d` is today + 7 days).
- **`+Xw` / `-Xw`**: Resolves to today plus or minus X weeks (e.g., `+1w` is today + 7 days).

---

## 4. Query Translation Logic (Conceptual)

On execution, the Tauri Rust Core backend:
1. Parses the `filter` syntax tree.
2. Expands relative dates into scalar date strings.
3. Translates project filters (`+work/marketing`) into hierarchical matches, automatically querying for the explicit parent project or any descendant matches (`LIKE 'work/marketing/%'`).
4. Joins the task-tag and task-context helper tables if tag or context conditions exist.
5. Executes the final constructed query securely against the SQLite caching database.
