# Release Build Setup

GitHub Actions builds signed draft releases from annotated version tags and publishes updater
manifests through GitHub Pages after manual release publication.

## Required Values

- `TAURI_SIGNING_PRIVATE_KEY`: secret updater private key content or path. Never commit it.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional secret key password.
- Updater public key is committed in `src-tauri/src/updates.rs`; changing it requires trust-key
  migration design.
- Stable endpoint is `https://pan-narrans.github.io/octarine/updates/stable.json`.
- Beta endpoint is `https://pan-narrans.github.io/octarine/updates/beta.json`.
- `OCTARINE_DISTRIBUTION`: `direct` for macOS or `appimage` for Linux.

Generate one long-lived updater keypair using current Tauri CLI. Back up private key before publishing
first updater-enabled build. Losing it prevents existing installations from accepting future update
artifacts.

```bash
npx tauri signer generate -w /secure/path/octarine.key
```

Release build merges release overlay into base configuration:

```bash
npm run tauri:build -- --config src-tauri/tauri.release.conf.json
```

Updater signing and macOS code signing are separate. First public macOS release still needs selected
Developer ID/notarization policy or documented Gatekeeper approval path.

## Distribution Builds

macOS direct and Linux AppImage builds keep user-selected stable/beta channel. No Homebrew, DEB, or
RPM artifact is built for v1. AppImage must run from user-writable directory for self-update.

## Publication Gate

Before first public release:

1. Enable GitHub Pages with GitHub Actions as source.
2. Generate and back up updater keypair; add `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets.
3. Complete public-source readiness review.
4. Verify DMG and AppImage installation instructions using draft release assets.
5. Before stable publication, pass signed update smoke matrix on macOS 15 Sequoia Apple Silicon,
   current Ubuntu LTS, and current stable Fedora.

## Release Process

### Prepare Release Line

1. Create unprotected `release/<version>` from latest `master`, for example `release/0.1.0`.
2. Select features for release. Each feature or fix reaches release branch through short-lived branch
   and PR. Never commit directly to release branch.
3. Keep unrelated or later work outside release branch.

### Publish Beta Iteration

1. Prepare version through PR so `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json` all contain exact prerelease version, such as `0.1.0-beta.1`.
2. Verify successful Quality and Security checks on release-branch tip, then create annotated tag
   there:

   ```bash
   git tag -a v0.1.0-beta.1 -m "Octarine v0.1.0-beta.1"
   git push origin v0.1.0-beta.1
   ```

3. Let `Draft release` workflow validate and build artifacts.
4. Inspect signed draft artifacts, then publish GitHub prerelease manually. First deployed Beta
   manifest establishes updater bootstrap; Stable manifest stays unchanged.
5. Complete signed update, rollback, failure-path, Linux, and Gatekeeper smoke matrix before stable
   promotion. Beta iterations may publish before this matrix because public Beta channel is required
   to exercise self-updates.

When testing finds bug:

1. Create `fix/<slug>` from same release branch.
2. Commit fix on that branch and merge it through PR into release branch.
3. Prepare next prerelease version through PR, such as `0.1.0-beta.2`.
4. Create new annotated tag on new release-branch tip. Never move `v0.1.0-beta.1`.
5. Build and publish new prerelease. Existing tag remains rollback target; retain smoke evidence for
   stable promotion.

```text
release/0.1.0

A──B──C  v0.1.0-beta.1
      \
       D──E──F  v0.1.0-beta.2
```

After stable `v0.1.0` exists, do not publish another `v0.1.0-beta.N`; SemVer considers stable
`0.1.0` newer than every prerelease for same core version. Start next line, such as
`v0.1.1-beta.1` or `v0.2.0-beta.1`.

### Promote Stable Release

1. Prepare stable version through PR into release branch so all configured versions contain exact
   stable version, such as `0.1.0`.
2. Run complete release verification and confirm successful Quality and Security checks.
3. Merge `release/0.1.0` into `master` through PR using merge commit.
4. Create and push annotated tag on resulting `master` tip:

   ```bash
   git tag -a v0.1.0 -m "Octarine v0.1.0"
   git push origin v0.1.0
   ```

5. `Draft release` workflow validates tag, runs complete quality gate, and builds:
   - signed direct macOS Apple Silicon updater and DMG;
   - signed Linux x86_64 AppImage updater.
6. Review draft assets and test installation. Do not publish failed or incomplete release.
7. Publish draft manually. `Publish updater manifests` validates immutable signed artifact URLs,
   points stable at current stable publication, selects greater SemVer across stable and beta for beta
   channel, then deploys through GitHub Pages.
8. Delete release branch after stable publication unless maintained release line still needs fixes.

Publishing prerelease makes Beta channel discover it. Draft creation alone changes no live updater
manifest. Stable publication requires attached validated smoke report. Pages may return 404 for
channel with no published release yet.

## Automation Alignment

Before using this branch model for releases, repository automation must enforce it:

- Quality and Security workflows run for PRs targeting `master` or `release/**`.
- Prerelease tag validation requires tag commit to belong to matching release branch.
- Stable tag validation requires tag commit to belong to `master`.
- GitHub branch rules protect only `master`; `release/**` remains unprotected.
- GitHub tag rules require successful Quality and Security checks for every `v*` tag and block tag
  updates and deletion.

Current automation must be reviewed and updated as part of branch-model migration. Do not create Beta
tag from release branch while workflow still requires every tag to belong to `master`.

## Manual Channel Rollback

Run `Set updater channel target` workflow from GitHub Actions. Choose `stable` or `beta`, then enter
existing published tag such as `v1.0.0`. Workflow rejects drafts, mismatched versions, incomplete
platform manifests, missing signatures, mutable URLs, and prerelease target for stable channel. It
preserves other channel and records operation in workflow summary.

Rollback never rebuilds or overwrites artifact. It republishes existing `latest.json` as mutable
channel pointer. Next relevant release publication resumes automatic routing.

## Required Smoke Matrix

Before v1, verify on macOS 15 Sequoia Apple Silicon, current Ubuntu LTS, and current Fedora stable:

- stable and beta upgrades;
- newer stable delivered to beta channel;
- beta-to-stable downgrade;
- manual rollback and forward recovery;
- unreachable manifest and invalid signature;
- interrupted download;
- read-only AppImage location;
- current version launches after every failure;
- initial Gatekeeper approval does not recur across two self-updates.

Repeated macOS approval warning blocks release because zero-cost ad hoc signing cannot guarantee
one-time Gatekeeper behavior without evidence.
