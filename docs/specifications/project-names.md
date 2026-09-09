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
