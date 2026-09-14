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
5. Pass signed update smoke matrix on macOS 15 Sequoia Apple Silicon, current Ubuntu LTS, and current
   stable Fedora.

## Release Process

1. Stabilize `release/<version>` and synchronize `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json` versions.
2. Merge verified release into `master`.
3. Create and push annotated tag on `master`:

   ```bash
   git tag -a v1.0.0 -m "Octarine v1.0.0"
   git push origin v1.0.0
   ```

   Use SemVer prerelease tags such as `v1.1.0-beta.1` for beta channel.

4. `Draft release` workflow validates tag, runs complete quality gate, and builds:
   - signed direct macOS Apple Silicon updater and DMG;
   - signed Linux x86_64 AppImage updater.
5. Review draft assets and test installation. Do not publish failed or incomplete release.
6. Publish draft manually. `Publish updater manifests` validates immutable signed artifact URLs,
   points stable at current stable publication, selects greater SemVer across stable and beta for beta
   channel, then deploys through GitHub Pages.

Publishing release makes matching update channel discover it. Draft creation alone changes no live
updater manifest. Pages may return 404 for channel with no published release yet.

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
