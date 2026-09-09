# ADR 0006: Hierarchical Kanban Navigation and Primary Contexts

## Status

Accepted

## Implementation Status

Current. Project routes provide Board and List presentations. Board behavior, source mutations, primary-context indexing, and large-group virtualization are implemented and covered by Rust, frontend, Storybook, and browser checks.

## Context

Octarine uses slash-delimited project paths such as `+work/client/project-a`. Project review must include tasks assigned directly to selected project plus every descendant without repeating selected ancestor on every card.

Tasks may contain multiple flat context tokens. Kanban needs one stable grouping dimension while preserving remaining Markdown metadata. Work can also be deliberately stashed without marking it complete.

## Decision

### Columns and visibility

Active columns use fixed order:

1. Todo — `[ ]`
2. Doing — `[/]`
3. Deferred — `[>]`

Done (`[x]`) and Cancelled (`[-]`) columns are hidden by default and may be enabled independently. Enabled closed columns append after Deferred in fixed order. Calendar events (`[<]`) never enter Kanban columns.

Project routes default to Board for fresh profiles. One client-local preference switches all project routes between Board and existing List presentation. Search and selected project survive presentation changes.

### Hierarchical project scope

Task project is visible when it equals selected project or begins with selected project followed by `/`. Plain string-prefix collisions do not match.

Direct-project cards omit project badge. Descendant cards strip selected prefix and display only remaining relative path. For selected `+work`, task `+work/client/project-a` displays `+client/project-a`.

### Primary context

First context token in source order is `primary_context`. It alone controls Kanban grouping and context navigation/filtering. Later contexts remain ordered and preserved but are inert for grouping and filtering. Context labels stay flat; slash characters do not create nested context navigation.

Each column places populated No context group first, then named groups in locale-aware alphabetical order.

### Movement contract

Dragging to status header or No context group changes status only and preserves every context. Dragging to named context group changes status and replaces first context token, or inserts one when absent. It never clears context, changes project, changes child tasks, or persists card order.

Frontend applies move optimistically, blocks repeat movement for pending card, and invokes one `move_task` command. Native writer validates original source and performs status plus optional primary-context change atomically. Success reindexes before reconciliation. Failure rolls back targeted card; conflicts refresh source-derived state.

### Ordering and scale

Cards sort by priority, due date, file path, line number, then task hash. Null priority and due date sort last. Manual order does not exist.

Groups above 50 root cards use `@tanstack/react-virtual` with dynamic measurement and overscan. Smaller groups render directly. Board owns horizontal overflow so columns retain readable width at narrow viewports.

## Consequences

- Project review exposes active and intentionally deferred work without treating review as workflow status.
- Markdown remains authoritative; board state adds no ordering or context hierarchy metadata.
- Secondary contexts survive every status-only move and primary-context replacement.
- Native drag has pointer semantics only; existing task editor remains non-pointer path for changing status and contexts.
- Closed-column visibility is session presentation state; Board/List mode alone persists globally.

## Superseded Proposal Details

Original proposal used Todo, In Progress, Done, and Cancelled as always-visible columns and considered optional event track. Implemented design adds Deferred, hides closed columns by default, and excludes events unconditionally. These changes reflect approved project-review workflow.
