# Project Names and File Routing

## Format

Project names use `/` for hierarchy. Each segment accepts Unicode letters, Unicode numbers, `_`, and
`-`. Octarine rejects spaces, dots, empty segments, absolute paths, leading or trailing `/`, and path
traversal.

Names normalize to Unicode NFC. Display spelling and capitalization stay unchanged. Identity uses
full Unicode case folding, so names such as `Work/Client` and `work/client` conflict. Existing
conflicts remain readable but block task creation, task moves, and project renames until user resolves
conflict.

## File Mapping

Project destination starts at configured `project_folder` inside vault:

```text
+work                 -> <vault>/<project_folder>/work.md
+work/project1        -> <vault>/<project_folder>/work/project1.md
+work/project1/client -> <vault>/<project_folder>/work/project1/client.md
```

Resolver rejects destinations outside vault, hidden destinations, paths matched by
`.octarineignore`, symlink escapes, and existing non-file destinations. Missing parent directories
may be created later by task writer after resolver approves path.

Project file path never implies task project metadata. Project-routed root task must contain exactly
one explicit `+project` token. Subtasks inherit parent project.

## Hierarchical Rename

Renaming project file or directory beneath configured project folder, or using rename action beside
project in sidebar, starts project rename preflight. Sidebar editor changes selected project segment;
for nested project, parent path remains unchanged. Renaming project-folder root remains configuration
change and is not project rename.

Rename operates on segment identity. `work` to `job` changes `+work` and descendants such as
`+work/client`, but leaves `+workshop` unchanged. It maps both project storage shapes when present:

```text
<project_folder>/work.md -> <project_folder>/job.md
<project_folder>/work/   -> <project_folder>/job/
```

Preflight reports task-token rewrites, file and directory moves, descendant impact, and collisions.
Execution requires current opaque preflight token. Destination and case-fold collisions block
execution. Case-only rename uses temporary sibling path for case-insensitive macOS filesystems.

Only explicit project tokens in task metadata change. Markdown links, prose, code, comments, and
ignored file contents remain unchanged. Ordinary files and ignored paths inside renamed directory
move with directory; moved ignored paths may require `.octarineignore` rule update.

Each Markdown file replacement is atomic, but complete multi-file rename is not globally atomic.
Partial failure returns completed operations, pending operations, paths to inspect, and recovery
guidance. Octarine never rolls project paths back automatically.
