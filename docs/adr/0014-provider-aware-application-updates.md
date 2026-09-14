# ADR 0014: Provider-Aware Application Updates

## Status

Superseded by ADR 0015

## Implementation Status

Historical. Direct and package-manager-aware paths were implemented during Tauri 2 migration. ADR
0015 removes package-manager paths from v1 scope after distribution-cost review.

## Context

Octarine targets macOS and Linux. Direct downloads need signed in-app updates; Homebrew, APT, and DNF
users expect package manager to remain source of installed files. Two independent installers writing
same application can race, confuse package database, or make later upgrades and removal unreliable.
Stable and beta channels need intentional selection without silently moving package-managed users
between package identities.

## Decision

One provider owns installation:

- Direct macOS and AppImage builds use Tauri updater. User chooses stable or beta. App checks
  automatically, downloads and verifies signed artifact, then installs only after explicit click.
- Homebrew builds lock channel at compile time. Stable cask is `octarine`; beta cask is
  `octarine@beta`. In-app click runs exact cask upgrade through Homebrew, then restarts. Standard fixed
  Homebrew executable paths are used; no shell parses user-controlled input.
- APT and DNF builds lock channel at compile time and may check release metadata. Installation remains
  terminal/package-manager owned until privileged helper passes distro-specific tests.
- Unknown distribution disables update installation.
- Direct/AppImage checks accept any different signed version offered by selected endpoint. This
  permits explicit downgrade and beta-to-stable transitions; same version remains no-op.

Release checks use channel-specific HTTPS endpoints. Updater public key is embedded at compile time;
private key exists only in release secret storage. Release artifacts are generated using
`tauri.release.conf.json` so ordinary local builds do not require signing secret.

## Consequences

- `brew upgrade` and in-app update button converge on Homebrew ownership instead of competing.
- `brew upgrade` can update Octarine when cask qualifies; app need not be running.
- Stable/beta package users switch channel by changing package identity, not application preference.
- Direct/AppImage downgrade requires release metadata intentionally offering lower signed version.
- Homebrew manual rollback remains possible through archived versioned cask/package data, subject to
  artifact availability and Homebrew policy. In-app rollback is absent.
- Gatekeeper approval behavior remains property of macOS signing/quarantine. Ad-hoc signing avoids
  damaged-app behavior but cannot promise one-time approval across replaced downloads.
