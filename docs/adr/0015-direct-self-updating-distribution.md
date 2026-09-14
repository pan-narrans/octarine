# ADR 0015: Direct Self-Updating Distribution

## Status

Accepted; supersedes ADR 0014

## Implementation Status

Implemented in release-preparation branch. Signed GitHub Actions build and cross-platform update smoke
matrix remain external release gates.

## Context

Octarine needs low-friction installation, updates, and rollback on personal macOS and Linux systems.
Homebrew cask publication and maintained APT/DNF repositories add ongoing packaging, review, and
repository work disproportionate to personal-project audience. Maintaining package-manager-specific
runtime branches before those channels exist creates dead behavior and multiplies untested ownership
paths.

Direct downloads already support Tauri updater signatures. Public GitHub Releases can host immutable
artifacts while GitHub Pages provides stable channel URLs at no added service cost.

## Decision

- v1 ships macOS Apple Silicon DMG and Linux x86_64 AppImage only.
- Both distributions use same Tauri signed self-update strategy.
- Remove Homebrew, APT, and DNF runtime branches, build jobs, names, commands, UI copy, and tests.
- Retain small distribution/install-strategy DTO boundary so future providers can extend contract.
- Stable channel points to current stable publication.
- Beta channel points to greater SemVer across current stable and beta publications.
- App checks metadata on launch and every 24 hours while running. Binary download starts only after
  explicit confirmation. Successful install restarts immediately.
- Any different signed version offered by selected endpoint remains eligible. This supports
  beta-to-stable transitions and explicit rollback.
- Manual GitHub Actions workflow can point either channel to existing signed published release.
- Release artifacts and tags remain immutable. Mutable Pages manifests act only as channel pointers.
- Update failure preserves installed version and offers retry plus direct release download.

## Consequences

- One update path reduces runtime, CI, documentation, and test surface.
- Users download initial installer manually from GitHub Releases.
- Linux AppImage must stay in user-writable directory for unprivileged replacement.
- Package-manager discovery, background upgrades, and centralized uninstall remain unavailable.
- Future package provider requires new implementation, packages, and ownership tests but can reuse
  existing UI contract.
- Updater signature protects artifact authenticity. Lost or compromised private key requires manual
  reinstall until key-rotation design exists.
- Ad hoc macOS signing keeps zero-cost constraint but cannot guarantee one-time Gatekeeper approval.
  Repeated warnings during multi-update smoke test block v1 or reopen signing policy.
