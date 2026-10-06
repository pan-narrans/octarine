# Perspective Configuration and Runtime Specification

## Purpose and ownership

A Perspective names a way to work, such as planning, writing, or daily work. It composes existing
Octarine capabilities around the current workspace. It does not create another copy of tasks, notes,
or files.

> A Perspective defines how existing Octarine data and capabilities are presented for a particular
> way of working. It does not own the underlying data, grant filesystem access, or expose
> implementation components.

> The Perspective module registry and configuration schemas are authoritative. Storybook derives
> its reference information from them and must not become a parallel source of module definitions.

Perspective configuration is optional JSON in `perspectives.json` beside `config.json` in the
platform application configuration directory `net.auranimnus.octarine`. It has its own schema
version and is not part of application settings version 3. A missing file uses the built-in
Perspective. The shared configuration editor is **CURRENT** and mounted in App through a
permanent sidebar-footer route; desktop and 390px App fixture flows were verified on 2026-10-06. See
[Configuration Specification](configuration.md) for the platform path and migrations.

## Version 1 format

Version 1 defines ordered Perspectives, each with an ordered sidebar module list:

```json
{
  "version": 1,
  "perspectives": [
    {
      "id": "default",
      "title": "Workspace",
      "sidebar": [
        { "id": "smart-views", "type": "smart-views" },
        {
          "id": "journal-files",
          "type": "file-tree",
          "title": "Journals",
          "root": "journal",
          "collection": "journal"
        },
        { "id": "notes", "type": "file-tree", "title": "Notes", "root": "vault" },
        { "id": "custom-views", "type": "custom-views" },
        { "id": "project-tree", "type": "project-tree" },
        { "id": "contexts", "type": "contexts" },
        { "id": "tags", "type": "tags" }
      ]
    },
    {
      "id": "writing",
      "title": "Writing",
      "sidebar": [
        { "id": "journal-files", "type": "file-tree", "title": "Journal", "root": "journal" },
        { "id": "notes", "type": "file-tree", "title": "Notes", "root": "vault" }
      ]
    }
  ]
}
```

Perspective IDs and module instance IDs use stable lowercase letters, numbers, and hyphens. Module
instance IDs are unique inside one Perspective. `type` is a semantic registry key; it never names a
React component. A type may appear more than once only when its registry definition allows multiple
instances. Sidebar array order is display order. Perspective array order is switch order.

Each module owns its options. The registry's field metadata drives both validation and Storybook
catalog details, including required fields, defaults, enum options, and examples. Arbitrary paths,
CSS, dimensions, positioning, and grid definitions are not valid module options. Unknown fields,
unknown module types, duplicate IDs, invalid module options, unsupported surfaces, and unsupported
schema versions are errors.

The reserved `default` ID replaces the built-in definition as a whole. Its sidebar array and title do
not merge with the built-in values. Version 1 has no inheritance. Invalid JSON or schema falls back
to the validated built-in Perspective and preserves the source file unchanged. The error is retained
for display with the Perspective view.

The settings editor builds configurations from the runtime module registry and runs
`validatePerspectiveConfig` before saving. Rust validates JSON syntax, the version 1 envelope,
Perspective and module-instance IDs, and duplicate IDs; it does not duplicate module field schemas or
registry policy. Save includes the exact source snapshot loaded by the editor. A stale snapshot
returns a conflict and leaves the file unchanged. Rust rejects symlinks and non-file targets, writes
a sibling temporary file, rechecks the snapshot, then atomically replaces the configuration. App
writes are serialized. Another process can still write during the small interval between the final
snapshot check and atomic replacement.

For a file-tree module, `collection: "journal"` is valid only with `root: "journal"`. It adds the
today-entry action. The journal root keeps its existing date grouping from the native journal tree.

## Module registry and Storybook

`src/features/perspectives/registry.ts` is the source of truth for semantic module types, surfaces,
instance policy, fields, defaults, examples, validation, and React implementations. The validator
rejects types that do not support `sidebar`. Add a module by registering its stable semantic type,
field metadata and validator, examples, supported surfaces, instance policy, and implementation.
Persisted JSON refers only to that semantic type.

Storybook's Perspective module catalog calls the same catalog builder over the runtime registry. It
does not maintain a second list or schema. The catalog describes metadata and examples; authored
stories show real shared components in useful states. Add stories for meaningful defaults, empty or
unavailable roots, active-file reveal, multiple instances, and responsive states when relevant.

The shared `PerspectiveStoryHarness` provides workspace roots, document selection, Perspective
switching, module state, and tree callbacks needed by those stories. It does not emulate native
filesystem authority. Storybook verifies rendered behavior and component appearance; Rust tests
verify root authorization.

Custom queries use existing task query syntax and the existing task view/query path. They do not add
a second query language or data-access engine. Future query controls or result surfaces require
reusing the existing query infrastructure.

Perspective custom-query navigation uses `perspective-query:<perspective-id>:<module-instance-id>`
internally, keeping stable module identity separate from legacy Custom Views routes, which retain
their title-based `view:<title>` IDs.

## Workspace roots and filesystem authority

The `root` option accepts logical root IDs only: `vault`, `journal`, and `projects`. Rust resolves
these IDs from the active configured vault and existing Vault, Journal, and project-folder settings.
Journal and project roots can be unavailable; a module reports the missing logical root by name. A
Perspective cannot name an absolute path, authorize a new folder, or add an external workspace root.
All current roots remain beneath the configured vault.

Rust canonicalizes root paths and checks descendants against the approved vault. Traversal and
symlink escapes are rejected at the command boundary, and tree scans skip symlinked files and
directories. Frontend validation is for clear configuration errors and is not the access-control
boundary. Users choose the vault through `Active Vault Path`
and set the vault-relative `Journal folder` and `Project folder` in Task settings. Perspective
configuration only refers to those existing settings.

## Switching and selection

Core switching is available independently of the visual `perspective-switcher` module. The runtime
supports switching by ID, moving to the next or previous configured Perspective, and keyboard
shortcuts `Meta+Alt+ArrowRight` / `Meta+Alt+ArrowLeft` or `Ctrl+Alt+ArrowRight` /
`Ctrl+Alt+ArrowLeft`. Shortcuts are ignored in editable controls. No command palette exists in the
current application.

The selected ID is stored client-locally under a key namespaced by workspace ID. If the saved ID is
missing from the loaded configuration, the runtime selects the first valid Perspective and reports
that recovery. Storage failures leave the current selection active and produce a visible warning.
Switching changes presentation; it does not authorize a path or need to rebuild the task index or
restart watchers.

## Persistent configuration and temporary UI state

The JSON file contains module intent, such as a file-tree instance ID, type, title, and logical root.
Interaction state remains in a separate in-memory Zustand store. Its key includes workspace ID,
Perspective ID, and module instance ID. File-tree expansion, collapse, scroll position, and reveal
tracking therefore remain separate for two same-type instances and across Perspectives. These
changes do not rewrite Perspective JSON and are not persisted across application restarts.

Tree requests are cached per workspace and logical root while the workspace remains active. Entering
a workspace invalidates its prior tree cache so returning to a previously opened vault reads current
filesystem state. Perspective-only switches keep the current workspace cache.

## File-tree reveal

When a file opens from a file-tree instance, that instance owns active-file reveal while the file is
inside its authorized root. Otherwise, Octarine selects the matching file tree with the deepest root.
Ties use the first matching module in Perspective order. Other trees do not receive the reveal. A
stale or unavailable source falls back to root matching.

## Supported surfaces and status

Version 1 supports the `sidebar` surface only. The model is organized around a Perspective and its
surface module list, but does not define main-area layout, arbitrary panels, grids, or windows. Adding
another surface requires an explicit versioned contract and registry capability; it does not make
Perspective configuration a general layout language.

The module registry, configuration validation, workspace-root commands, runtime hooks, Storybook
reference, editor, and existing sidebar renderer are implemented. The existing sidebar composition is
**CURRENT**: Storybook approval and rendered app inspection on 2026-10-05 confirmed built-in
modules, Perspective switching with and without a switcher, query results, retained unsaved note
text, and mobile navigation/footer. The shared settings editor is **CURRENT** and wired
into App through a permanent sidebar-footer route; creation, module editing, saving, activation,
and mobile navigation were inspected on 2026-10-06. The browser
fixture mocks Tauri IPC in memory; native shell and filesystem behavior rely on Rust tests. See
[`docs/visual-development.md`](../visual-development.md) for the Storybook-to-app review gate and
[`ADR 0016`](../adr/0016-perspective-surfaces-and-module-registry.md) for the architecture decision.
