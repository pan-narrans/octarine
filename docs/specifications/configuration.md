# Configuration Specification

Octarine stores `config.json` beneath operating system platform configuration directory in
`net.auranimnus.octarine` subdirectory. Configuration saves use same-directory temporary file and
atomic replacement.

## Version 3

Version 3 uses one absolute vault capability. Journal, project, and inbox locations are relative to
vault. `update_channel` is `stable` or `beta` and defaults to `stable` during migration.

```json
{
  "version": 3,
  "vault_dir": "~/octarine_vault",
  "journal_folder": "journals",
  "daily_filename_pattern": "YYYY-MM-DD.md",
  "project_folder": "projects",
  "inbox_file": "inbox.md",
  "default_unprojected_destination": "inbox",
  "templates": {
    "inbox": {
      "template": "# Inbox\n\n## Tasks\n",
      "insertion": { "mode": "heading", "target": "## Tasks" }
    },
    "daily_note": {
      "template": "# {{date}}\n\n## Tasks\n",
      "insertion": { "mode": "heading", "target": "## Tasks" }
    },
    "project": {
      "template": "# {{project_name}}\n\nProject: +{{project}}\n\n## Tasks\n",
      "insertion": { "mode": "heading", "target": "## Tasks" }
    }
  },
  "update_channel": "stable"
}
```

Unknown fields and unsupported versions are rejected. Insertion mode is `heading`, `marker`, or
`eof`. Task settings load and save through typed native commands. Saves validate relative paths,
`.octarineignore`, destination kinds, templates, and insertion targets before atomic replacement.
Saving migrated journal settings creates configured internal journal directory and clears migration
metadata; external source remains untouched.

## Identifier and Version 2 Migration

Application identifier changed from `com.octarine.app` to `net.auranimnus.octarine`. When new
configuration does not exist, startup copies old identifier's `config.json` into new directory. Old
file remains untouched. New identifier uses separate cache directory, so disposable SQLite index is
rebuilt from Markdown.

Version 2 configuration migrates to version 3 by adding stable update channel. Original is copied
once to `config.v2.backup.json` beside migrated configuration.

## Version 1 Migration

Version 1 stores independent `vault_dir` and `journal_dir` values. Migration never moves user files.

- Journal beneath vault converts to normalized relative `journal_folder`.
- Journal outside vault remains untouched.
- External journal produces `journal_migration.external_journal_dir` recovery metadata and disables
  journal commands until user selects folder beneath vault.
- Original version 1 config is copied once to `config.v1.backup.json` beside current config.
- Repeated version 3 loads do not rewrite backup.

Pending migration example:

```json
{
  "version": 3,
  "vault_dir": "~/octarine_vault",
  "journal_folder": "journals",
  "daily_filename_pattern": "YYYY-MM-DD.md",
  "project_folder": "projects",
  "inbox_file": "inbox.md",
  "default_unprojected_destination": "inbox",
  "templates": {
    "inbox": {
      "template": "# Inbox\n\n## Tasks\n",
      "insertion": { "mode": "heading", "target": "## Tasks" }
    },
    "daily_note": {
      "template": "# {{date}}\n\n## Tasks\n",
      "insertion": { "mode": "heading", "target": "## Tasks" }
    },
    "project": {
      "template": "# {{project_name}}\n\nProject: +{{project}}\n\n## Tasks\n",
      "insertion": { "mode": "heading", "target": "## Tasks" }
    }
  },
  "update_channel": "stable",
  "journal_migration": {
    "external_journal_dir": "~/octarine_journal"
  }
}
```

Legacy `~/.octarine_config.json` import follows same migration rules. Legacy file remains untouched.

## Runtime Overrides

- `OCTARINE_VAULT_DIR` overrides configured vault root without persisting change.
- `OCTARINE_JOURNAL_FOLDER` overrides configured relative journal folder without persisting change.
- Legacy `OCTARINE_JOURNAL_DIR` remains temporary compatibility alias but must resolve beneath active
  vault.

Runtime overrides never expand filesystem capability beyond active vault.
