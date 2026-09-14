# Project Definition: Direct Self-Updating Distribution

## 1. Executive Summary

### Overview

Ship Octarine through public GitHub Releases as macOS Apple Silicon DMG and Linux x86_64 AppImage.
Both installations use Tauri signed self-update. App checks metadata on launch and every 24 hours while
running, prompts before download, then downloads, verifies, installs, and restarts after explicit user
confirmation.

Remove Homebrew, APT, and DNF implementation and build paths. Keep generic provider boundary so
future distribution methods can be added without changing update UI contract.

### Target Audience

Primary user runs Octarine on personal Apple Silicon Mac. Colleagues may download public artifacts
without repository access or package-manager setup. Linux users run standalone AppImage from
user-writable location.

Primary job:

> Install Octarine directly, then accept signed stable or beta updates without returning to terminal or
> download page.

### Scope Boundary

#### In Scope — v1

- macOS 15 Sequoia or newer on Apple Silicon.
- Linux x86_64 AppImage, built on Ubuntu 22.04.
- Public GitHub Release assets and public GitHub Pages updater manifests.
- Stable and beta channels.
- Stable channel receives stable releases only.
- Beta channel receives highest current SemVer across stable and beta releases.
- Channel preference persists locally.
- Metadata check on every launch and every 24 hours during long-running session.
- Manual “Check for updates” action remains available.
- Update prompt shows target version, channel, release notes, and restart warning.
- “Later” defers same version until next scheduled check; no permanent version skip.
- Binary download begins only after explicit “Update now” click.
- Signed artifact verification with no bypass.
- Immediate restart after successful install.
- Beta-to-stable switch may offer signed downgrade immediately.
- Explicit GitHub Actions channel-target operation supports rollback to existing signed release.
- Failed update keeps current version launchable and offers Retry plus public download page.
- Published artifacts remain immutable and retained indefinitely.
- One documented Gatekeeper approval during initial macOS installation, subject to release smoke test.
- No authentication, accounts, hosted application backend, or telemetry.

#### Out of Scope — Future

- Homebrew casks.
- APT or DNF repositories and packages.
- Package-manager detection, invocation, or package-specific update UI.
- Linux ARM64.
- macOS Intel.
- Windows distribution.
- Apple Developer ID signing and notarization.
- Background binary download or silent installation.
- Permanent “skip this version” preference.
- Automatic updater-key rotation.

## 2. Technical Architecture

### Tech Stack

| Layer              | Technology                        | Role and justification                                                                     |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| Desktop shell      | Tauri 2                           | Existing cross-platform runtime and signed updater integration.                            |
| Application        | React, TypeScript, Rust           | Existing UI, IPC, settings, and native update orchestration.                               |
| Artifact hosting   | GitHub Releases                   | Public immutable versioned binaries and updater artifacts at zero added cost.              |
| Manifest hosting   | GitHub Pages                      | Stable public URLs already embedded in released applications.                              |
| Release automation | GitHub Actions                    | Tagged builds, signed updater artifacts, draft review, publication, and rollback control.  |
| Update signing     | Tauri minisign-compatible keypair | Artifact authenticity independent from transport and GitHub account state.                 |
| macOS code signing | Ad hoc identity                   | Zero-cost Apple Silicon build; initial Gatekeeper approval remains documented requirement. |
| Linux packaging    | AppImage                          | Standalone user-writable application supports unprivileged replacement.                    |

### System Design

1. Annotated `v<version>` tag on `master` starts release workflow.
2. Workflow verifies tag ancestry and synchronized Cargo, npm, and Tauri versions.
3. Quality gate runs before packaging.
4. macOS job builds DMG plus signed Tauri updater archive for `aarch64-apple-darwin`.
5. Linux job builds signed AppImage updater artifact for `x86_64-unknown-linux-gnu`.
6. GitHub draft release receives human installers, updater artifacts, signatures, generated notes, and
   `latest.json`.
7. Manual draft publication makes release eligible for channel routing.
8. Publication workflow updates stable and beta GitHub Pages pointers. Stable points to current stable
   publication. Beta points to greater SemVer of current stable and current beta publications.
9. Manual channel-target workflow accepts channel plus existing release tag, verifies signed updater
   manifest, and republishes selected manifest. This operation permits intentional downgrade. Next
   relevant release publication resumes automatic routing.
10. App checks selected manifest on launch, on manual request, and every 24 hours while running.
11. App serializes checks so launch, timer, and manual requests cannot install concurrently.
12. App compares target against installed version. Any different signed version is eligible when
    selected channel points to it, allowing explicit channel downgrade and rollback.
13. App fetches binary only after confirmation, verifies signature, installs, and restarts immediately.
14. Failed check or install preserves current application and exposes retry plus release-page fallback.

### Update Provider Contract

Provider-specific names and branches are removed. Generic boundary remains:

```typescript
type UpdateChannel = "stable" | "beta";
type DistributionMethod = "direct" | "appimage";
type UpdateInstallStrategy = "self_update";

interface UpdateRuntimeInfo {
  distribution: DistributionMethod;
  strategy: UpdateInstallStrategy;
  channel: UpdateChannel;
  lastCheckedAt: string | null;
}

interface AvailableUpdate {
  currentVersion: string;
  targetVersion: string;
  channel: UpdateChannel;
  releaseNotes: string | null;
  downloadPageUrl: string;
}
```

Future package providers extend provider implementation and strategy types. Current code contains no
Homebrew, APT, or DNF executable paths, package names, channel locks, build flags, UI copy, or test
fixtures.

### Manifest Contract

Stable endpoint:

```text
https://pan-narrans.github.io/octarine/updates/stable.json
```

Beta endpoint:

```text
https://pan-narrans.github.io/octarine/updates/beta.json
```

Each document uses Tauri static updater schema and contains version, release notes, publication time,
platform download URLs, and signatures. URLs reference immutable assets under versioned GitHub Release
tag. Manifest files are mutable channel pointers; release artifacts are immutable.

### Scheduling and State

- Launch always performs metadata check after native runtime becomes ready.
- Long-running process schedules next check 24 hours after completed automatic check.
- Manual checks may run at any time but reuse one in-flight request.
- “Later” stores no permanent suppression. Same version may return after 24 hours or next launch.
- No binary bytes download before confirmation.
- Channel change performs immediate metadata check.

### Distribution Instructions

macOS page provides DMG, drag-to-Applications steps, and one-time Gatekeeper approval instructions.
Linux page provides AppImage, executable-bit command, and requirement to keep file in user-writable
location. Read-only AppImage location produces update error plus download-page fallback.

## 3. Security, Authentication, and APIs

### Authentication

Application update checks require no authentication. GitHub Release assets and GitHub Pages manifests
are public. Release creation, publication, and channel rollback require repository write permission and
GitHub Actions authorization.

### Trust Model

- Embedded updater public key is trust anchor.
- Private updater key exists only in GitHub Actions secret storage plus offline backup.
- Signature verification failure stops installation with no bypass.
- HTTPS protects transport; updater signature protects artifact authenticity.
- Existing release assets and tags are never overwritten or reused.
- Lost or compromised private key requires manual reinstall until key-rotation design exists.
- Updater logs contain operational status only; no vault paths, task content, or telemetry.

### APIs and External Services

- Tauri updater reads public static JSON over HTTPS.
- GitHub Actions uses GitHub Releases API to create drafts and locate immutable assets.
- GitHub Pages deployment publishes channel manifests.
- No custom HTTP API or hosted backend exists.

## 4. Acceptance Criteria

### Product Behavior

1. Repository contains no Homebrew, APT, or DNF runtime branches, executable paths, package names,
   build jobs, UI text, or provider-specific tests.
2. Direct macOS and AppImage builds report `self_update` strategy through same typed IPC contract.
3. App checks metadata on launch, every 24 hours while open, after manual request, and immediately after
   channel change.
4. Concurrent check triggers collapse into one operation.
5. Stable selection queries stable pointer only.
6. Beta selection receives highest current SemVer across stable and beta pointers.
7. Update prompt includes current and target versions, channel, release notes, and immediate-restart
   warning.
8. “Later” downloads nothing and same version becomes eligible at next scheduled check.
9. “Update now” downloads, verifies, installs, and restarts without terminal interaction.
10. Invalid signature has no installation bypass.
11. Failure preserves launchable current version and exposes Retry plus download page.
12. Switching beta to stable can offer lower signed stable version.
13. Manual channel-target workflow can point stable or beta to older existing signed release.
14. Publishing draft alone changes no updater endpoint. Publishing release changes applicable channel.
15. Human downloads contain only macOS Apple Silicon DMG and Linux x86_64 AppImage; updater support
    assets remain attached as required.

### Release Verification

Before v1 publication, manually verify each path on macOS 15 Sequoia Apple Silicon, current Ubuntu LTS,
and current stable Fedora:

- stable-to-stable upgrade;
- beta-to-beta upgrade;
- stable release offered to beta user when newer than beta target;
- beta-to-stable channel downgrade;
- manual channel rollback to lower signed version;
- unreachable manifest;
- invalid signature;
- interrupted download;
- read-only AppImage location on Linux;
- launch of unchanged current version after every failure.

CI builds Linux artifacts on Ubuntu 22.04 for broader runtime compatibility. Release cannot publish
until smoke matrix passes. New Ubuntu LTS and Fedora stable releases enter matrix at release time.

### Automated Verification

- Rust tests cover provider mapping, channel routing, version comparison, downgrade eligibility, error
  mapping, and no-install-on-signature-failure behavior.
- Frontend tests cover launch/manual/timer scheduling, in-flight deduplication, prompt content, Later,
  Retry, release-page fallback, and immediate channel-change check.
- Workflow validation covers annotated tag, `master` ancestry, synchronized versions, immutable tag
  naming, stable/beta routing, higher-SemVer beta selection, explicit rollback, and missing signature.
- Required repository gates remain green:

  ```bash
  npm run ipc:check
  npm run format:check
  npm run lint
  npm run build
  cd src-tauri
  cargo fmt --all -- --check
  cargo clippy --all-targets -- -D warnings
  cargo test --all-targets
  ```

## 5. Documentation Updates

Implementation updates:

- `docs/adr/0014-provider-aware-application-updates.md`: supersede package-manager ownership decision
  with direct self-updater-only v1 policy.
- `docs/development/releasing.md`: remove managed-package builds; document rollback workflow and smoke
  matrix.
- `docs/architecture.md`: describe single provider implementation and update scheduler.
- `docs/roadmap.md`: defer Homebrew/APT/DNF and track direct release validation.
- `README.md`: document DMG/AppImage installation, Gatekeeper approval, writable AppImage location,
  update channels, and failure fallback.

## 6. Explicit Assumptions and Risks

- “Self updater only” removes current package-manager behavior rather than hiding it.
- Generic provider interface remains small and contains no speculative provider implementation.
- Stable and beta manifests function as release pointers, not append-only release records.
- Manual channel targeting is authorized rollback signal and may intentionally offer lower version.
- Beta normally tracks highest SemVer across stable and beta; explicit rollback overrides this until next
  relevant release publication.
- Public repository transition occurs before first public release.
- GitHub Pages and GitHub Releases remain available public infrastructure.
- Zero-cost ad hoc macOS signing cannot guarantee Gatekeeper behavior. One-time approval must be proven
  across initial install and multiple self-updates during smoke testing. Repeated warnings block release
  or require revised signing policy.
- Updater-key loss or compromise has no seamless v1 recovery. Manual reinstall is accepted recovery.
- AppImage self-update requires writable original file and directory.
- Interrupted installation behavior depends partly on Tauri updater guarantees and must be verified on
  every supported operating system.
