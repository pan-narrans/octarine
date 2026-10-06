# ADR 0016: Perspective Surfaces and Module Registry

## Status

Accepted — 2026-10-05

## Implementation Status

Implemented. The version 1 configuration model, module registry, built-in definition, logical-root
commands, Storybook catalog, module stories, selection helpers, UI-state store, and App renderer are
integrated. Existing sidebar composition is **CURRENT**: user approved Storybook design on
2026-10-05, and rendered app inspection that day confirmed built-in modules, Perspective switching
with and without a switcher, custom query results, retained unsaved note text, and mobile
navigation/footer. The shared configuration editor is **CURRENT**: user approved its Storybook
design on 2026-10-06, and rendered App inspection verified creating `Research`, adding `File Tree`,
saving, and the Perspectives footer on a 390px mobile viewport without horizontal overflow; choosing
the footer action also closes the navigation drawer. App browser fixtures mock Tauri IPC and keep
configuration saves in memory. Separate Rust tests in `src-tauri/src/perspectives.rs` exercise real
configuration reads and guarded writes inside temporary directories, including malformed input,
create-only saves, atomic replacement, and stale-snapshot conflict preservation. Browser fixture
coverage does not prove those native filesystem guarantees in an integrated desktop session.

## Context

Octarine needs several ways to present the same vault for planning, writing, and daily work. These
views must not fork Markdown data or duplicate filesystem authority. The first implementation needs
to reuse existing sidebar capabilities while leaving a clear path to future surfaces. Storybook
already reviews shared UI components, so module configuration, implementation, and documentation
must share one source of truth.

## Decision

We propose treating a Perspective as an ordered presentation of existing capabilities. A Perspective
does not own data, grant filesystem access, or expose implementation component names. Its versioned
configuration declares stable Perspective IDs, user-facing titles, ordered module instances, and
semantic module types. Module-specific options remain scoped to each registered type; arbitrary
layout controls and inheritance are excluded from version 1.

Version 1 supports the sidebar surface only. The model keeps Perspective definitions, surfaces, and
module instances distinct without implementing main-area layouts, grids, windows, or a general
layout language. Adding a surface requires an explicit schema and registry contract change.

The runtime module registry is authoritative for semantic types, module validation fields, defaults,
examples, supported surfaces, instance policy, and UI implementations. Storybook derives its module
reference from this registry and does not maintain a parallel list or schema. Authored stories review
real shared modules and their meaningful states.

Modules reference logical roots that Rust resolves from the active configured vault and existing
Journal and Project settings. Perspective JSON cannot provide a path or authorize a new location.
Rust remains the filesystem authority and constrains resolved roots to the canonical vault.

The built-in `default` Perspective uses the same schema, validator, registry, renderer, and UI-state
path as user definitions. A user definition with ID `default` replaces the whole built-in definition;
module arrays and properties do not merge. When no user `default` exists, runtime prepends the
built-in definition and preserves user ordering.

Switching is a core runtime command and keyboard capability. The optional sidebar switcher only
provides a visual control. The selected ID is persisted per workspace, while transient module state
is keyed separately by workspace, Perspective, and module instance. Custom queries reuse Octarine's
existing query infrastructure.

See [Perspective Configuration and Runtime Specification](../specifications/perspectives.md) for
the version 1 contract and current limitations.

## Consequences

- New modules register once and appear in Storybook's generated catalog from registry metadata.
- Built-in and user-defined sidebars share validation, rendering, and state behavior.
- Existing workspace settings remain the only way to select authorized filesystem roots.
- Version 1 does not support additional surfaces, arbitrary external roots, inheritance, or a new
  query language. The settings editor stays within the existing registry-defined schema.
- The app uses the same registry-backed sidebar implementation reviewed in Storybook. Rendered app
  review confirmed switching, query navigation, note-buffer retention, and mobile footer integration.
