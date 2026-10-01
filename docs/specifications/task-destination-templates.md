# Task Destination Templates

Octarine stores separate inline templates for Inbox, Daily note, and Project destinations in version
2 application configuration. Templates create missing destination files once. Existing files keep
their content when template settings change.

## Placeholders

```text
{{project}}       Full project path, such as work/project1
{{project_name}}  Leaf project name, such as project1
{{date}}          Local submission date, YYYY-MM-DD
{{datetime}}      Local submission timestamp, RFC 3339
```

Inbox and Daily note templates accept date placeholders. Project templates accept all placeholders.
Unknown placeholders, unmatched delimiters, nested delimiters, and project placeholders in
unprojected templates fail settings validation.

Rendering uses submission timestamp supplied by task creation service. Engine performs literal
replacement only: no code evaluation, environment lookup, or filesystem access.

Task insertion happens after missing file receives rendered template. Existing destination bypasses
template rendering and proceeds directly to configured insertion strategy.
