# Configuration Specification

Octarine stores `config.json` beneath the operating system's platform configuration directory in the `com.octarine.app` subdirectory.

The current document is version 1:

```json
{
  "version": 1,
  "vault_dir": "~/octarine_vault",
  "journal_dir": "~/octarine_journal"
}
```

Unknown fields and unsupported versions are rejected. Configuration saves use a same-directory temporary file and atomic replacement.

## Legacy Migration

When the versioned file does not yet exist, Octarine imports `vault_dir` and `journal_dir` from `~/.octarine_config.json`. Missing values receive current defaults. The legacy file is retained for recovery but is ignored after the versioned file has been created.

## Runtime Overrides

- `OCTARINE_VAULT_DIR` overrides the configured vault directory.
- `OCTARINE_JOURNAL_DIR` overrides the configured journal directory.

Overrides are independent and are not written into `config.json`. A path beginning with `~/` is expanded against the current home directory before the capability root is created and canonicalized.
