# Implementation Backlog: Direct Self-Updating Distribution

Source: `docs/project-definitions/self-updater.md`

## Phase 1: Foundation and Update Model

### UPD-101 - Remove package-manager runtime paths

- **Description:** Simplify Rust update domain to direct macOS and AppImage distributions using one
  self-update strategy. Delete Homebrew process execution, Homebrew/APT/DNF enum variants, compile-time
  channel locks, unsupported package-manager responses, helper functions, and provider-specific tests.
  Preserve generic distribution and install-strategy DTO boundary for future providers.
- **Acceptance Criteria:**
  - [ ] `DistributionMethod` contains only `direct` and `app_image` for supported v1 builds plus explicit
        unsupported fallback when platform cannot self-update.
  - [ ] `UpdateInstallStrategy` exposes `self_update` plus unsupported fallback; no package-manager
        strategy remains.
  - [ ] Direct macOS and AppImage builds use persisted user channel.
  - [ ] No Rust code references Homebrew executable paths, cask names, APT, or DNF.
  - [ ] Unknown Linux execution outside AppImage fails safely without claiming updater support.
- **Validation / Verification:**
  - _How to verify:_ Run `rg -n "Homebrew|homebrew|APT|apt|DNF|dnf|octarine@beta" src-tauri/src` and
    inspect any non-package-manager matches; run updater unit tests and full Rust gate.

### UPD-102 - Regenerate and simplify frontend update contracts

- **Description:** Regenerate TypeScript DTOs after Rust model change. Remove package-manager labels,
  descriptions, managed-state branches, fixtures, stories, and tests. Keep one self-update presentation
  for direct DMG and AppImage distributions.
- **Acceptance Criteria:**
  - [ ] Generated DTOs match reduced Rust enums without manual edits.
  - [ ] Settings UI never describes package-manager ownership or terminal update commands.
  - [ ] Direct and AppImage labels remain understandable.
  - [ ] Unsupported local development build explains that packaged updater is unavailable.
  - [ ] Homebrew-specific Storybook state and model assertions are removed.
- **Validation / Verification:**
  - _How to verify:_ Run `npm run ipc:check`, settings model tests, Storybook build, and
    `rg -n "Homebrew|APT|DNF|package manager" src src/generated`.

### UPD-103 - Reduce release matrix to self-updating artifacts

- **Description:** Remove Homebrew DMG, DEB, and RPM jobs from draft release workflow. Keep serialized
  signed updater builds for macOS Apple Silicon DMG and Linux x86_64 AppImage so `latest.json` merges
  without asset race.
- **Acceptance Criteria:**
  - [ ] Release workflow builds only macOS `aarch64-apple-darwin` DMG and Linux
        `x86_64-unknown-linux-gnu` AppImage.
  - [ ] Both builds use release overlay and updater signing secrets.
  - [ ] Draft contains human installer plus required updater archive/signature assets and one merged
        `latest.json`.
  - [ ] No `OCTARINE_UPDATE_CHANNEL`, Homebrew, DEB, RPM, APT, or DNF package build remains.
  - [ ] Draft publication remains manual.
- **Validation / Verification:**
  - _How to verify:_ Parse workflow YAML, run workflow linter, inspect action diff, then execute one
    draft prerelease build from annotated test tag after merge to release branch.

### UPD-104 - Implement deterministic channel manifest resolver

- **Description:** Move stable/beta routing from inline shell into testable repository script. Stable
  target equals current published stable release. Beta target equals greater SemVer of current stable
  and beta releases. Resolver must reject drafts, missing updater manifest, invalid platform records,
  and unsigned platform entries.
- **Acceptance Criteria:**
  - [ ] Stable publication updates stable target.
  - [ ] Beta publication updates beta candidate.
  - [ ] Beta result selects greater SemVer across current stable and beta targets.
  - [ ] SemVer prerelease precedence follows SemVer 2.0.
  - [ ] Existing other-channel target remains unchanged when publication does not affect it.
  - [ ] Resolver fails before Pages deployment when selected manifest lacks macOS ARM64 or Linux x64
        signed updater entry.
- **Validation / Verification:**
  - _How to verify:_ Fixture tests cover stable newer, beta newer, equal base prerelease ordering,
    missing channel, malformed JSON, missing signature, and immutable release URLs. Run fixture tests in
    quality workflow.

### UPD-105 - Add explicit channel rollback workflow

- **Description:** Add manual GitHub Actions operation accepting `stable|beta` plus existing published
  tag. Download and validate tag's `latest.json`, set selected channel pointer, preserve other pointer,
  and deploy through same Pages path and concurrency lock as automatic publication.
- **Acceptance Criteria:**
  - [ ] Only repository-authorized workflow user can start operation.
  - [ ] Inputs reject unknown channel, draft release, missing tag, missing manifest, missing signature,
        or unsupported platform set.
  - [ ] Older signed version is accepted intentionally.
  - [ ] Other channel remains byte-for-byte unchanged.
  - [ ] Workflow summary records actor, selected channel, tag, source version, and deployed URL.
  - [ ] Next relevant release publication resumes automatic channel routing.
- **Validation / Verification:**
  - _How to verify:_ Test resolver fixtures, run dry deployment against draft Pages artifact, then
    perform rollback and forward recovery using disposable signed prereleases.

## Phase 2: Core Update Workflows

### UPD-201 - Add launch and 24-hour update scheduler

- **Description:** Refactor application update hook around explicit scheduler. Check once when runtime
  information becomes ready, schedule next automatic check 24 hours after completed automatic check,
  and clean timer on unmount. Keep manual check available.
- **Acceptance Criteria:**
  - [ ] Packaged supported build checks once each launch.
  - [ ] Long-running session checks again every 24 hours.
  - [ ] Development or unsupported build does not schedule remote checks.
  - [ ] Timer cleanup prevents checks after unmount.
  - [ ] Automatic no-update result stays silent; manual no-update result confirms current version.
- **Validation / Verification:**
  - _How to verify:_ Vitest fake-timer tests cover launch, 23h59m, 24h, repeated intervals, unmount,
    unsupported runtime, and automatic/manual notification behavior.

### UPD-202 - Serialize checks and react to channel changes

- **Description:** Replace render-state race guard with stable in-flight reference or controller so
  launch, timer, manual, and channel-change checks collapse into one request. Run immediate silent check
  after persisted channel change, including beta-to-stable downgrade eligibility.
- **Acceptance Criteria:**
  - [ ] Multiple triggers during one check invoke IPC once.
  - [ ] Channel change persists before check starts.
  - [ ] Channel change clears stale available update.
  - [ ] New check uses newly selected endpoint.
  - [ ] Lower stable target remains eligible after beta-to-stable switch.
- **Validation / Verification:**
  - _How to verify:_ Deferred-promise hook tests trigger manual, timer, and channel change concurrently;
    assert one IPC request, ordered persistence, correct endpoint result, and stale-state removal.

### UPD-203 - Complete explicit update confirmation flow

- **Description:** Present target version, channel, release notes, and immediate restart warning before
  binary download. Provide Update now and Later. Later closes prompt without installing or suppressing
  future checks.
- **Acceptance Criteria:**
  - [ ] Prompt distinguishes installed and target versions.
  - [ ] Prompt labels stable or beta channel.
  - [ ] Release notes render as inert text with safe length limit.
  - [ ] Restart warning appears before Update now.
  - [ ] Later performs no install IPC and creates no permanent skip state.
  - [ ] Update now invokes install once using expected target version.
- **Validation / Verification:**
  - _How to verify:_ Component and controller tests cover prompt content, missing notes, long/untrusted
    notes, Later, double-click prevention, and install argument. Inspect rendered Storybook states before
    app integration under visual-development workflow.

### UPD-204 - Add safe retry and download fallback

- **Description:** Normalize check/install failures into user-safe error state. Preserve available update
  when retry is valid, expose Retry, and expose Open download page using immutable GitHub Release tag
  derived from validated target version. Never expose install-anyway path.
- **Acceptance Criteria:**
  - [ ] Check failure offers Retry and releases overview fallback.
  - [ ] Install failure offers Retry plus exact version download page.
  - [ ] Signature failure uses same safe path with no bypass.
  - [ ] Interrupted download leaves installing state reset and current app usable.
  - [ ] Read-only AppImage failure tells user to move/download into writable location.
  - [ ] URLs remain fixed to official `pan-narrans/octarine` GitHub repository.
- **Validation / Verification:**
  - _How to verify:_ Rust error-mapping tests and frontend rejected-promise tests cover network,
    signature, interruption, stale target, and AppImage permission cases. Manually inspect opened URLs.

### UPD-205 - Preserve signed downgrade semantics

- **Description:** Keep Tauri comparator accepting any version different from installed version while
  requiring expected-version recheck immediately before installation. Document why normal SemVer
  monotonic comparison is intentionally not used.
- **Acceptance Criteria:**
  - [ ] Higher stable or beta target installs.
  - [ ] Lower channel-switch or rollback target installs only when current signed endpoint offers it.
  - [ ] Same installed version produces no update.
  - [ ] Manifest target changing between prompt and click aborts install.
  - [ ] Signature verification remains mandatory for downgrade.
- **Validation / Verification:**
  - _How to verify:_ Rust unit tests cover higher, lower, equal, and changed-target cases; signed manual
    smoke test performs beta-to-stable and rollback downgrades.

## Phase 3: Integration, Security, and Release Polish

### UPD-301 - Supersede provider-aware update documentation

- **Description:** Record approved self-updater-only decision in new ADR that supersedes ADR 0014
  without rewriting history. Update architecture, roadmap, and releasing guide to match implemented
  behavior and deferred package-manager support.
- **Acceptance Criteria:**
  - [ ] New ADR records context, decision, consequences, rollback policy, and future provider seam.
  - [ ] ADR 0014 links to superseding ADR and retains historical decision.
  - [ ] Architecture contains no claim that package-manager builds exist.
  - [ ] Roadmap moves Homebrew/APT/DNF to demand-driven future work.
  - [ ] Releasing guide documents only DMG/AppImage artifacts and channel operations.
- **Validation / Verification:**
  - _How to verify:_ Repository search finds package-manager terms only in historical/deferred context;
    review documentation against runtime and workflows.

### UPD-302 - Publish direct installation and recovery guide

- **Description:** Extend README with public GitHub Releases download flow, macOS DMG installation and
  Gatekeeper approval, Linux AppImage executable/writable-location setup, stable/beta behavior, update
  confirmation, and manual recovery.
- **Acceptance Criteria:**
  - [ ] macOS instructions cover drag to Applications and exact initial Gatekeeper path.
  - [ ] Linux instructions cover `chmod +x`, user-writable location, and launch.
  - [ ] Stable/beta and immediate restart behavior are explicit.
  - [ ] Failed-update section links public Releases page.
  - [ ] Support matrix states macOS 15+ Apple Silicon and Linux x86_64 AppImage.
  - [ ] Instructions do not advertise package-manager installation.
- **Validation / Verification:**
  - _How to verify:_ Follow guide from clean macOS account, Ubuntu VM, and Fedora VM using draft assets;
    verify every command and UI label verbatim.

### UPD-303 - Automate updater regression gates

- **Description:** Add focused frontend, Rust, and channel-resolver tests to quality workflow. Validate
  workflow YAML using pinned action linter. Keep secrets unavailable to pull-request tests.
- **Acceptance Criteria:**
  - [ ] Unit and fixture tests run on pull requests targeting develop or master.
  - [ ] Workflow lint covers release and Pages files.
  - [ ] Test jobs need read-only token and no signing secret.
  - [ ] Release jobs alone receive write permission and signing secret.
  - [ ] Full repository gate remains green.
- **Validation / Verification:**
  - _How to verify:_ Open test pull request, inspect permissions and secret access, then run frontend,
    Rust, resolver, formatter, linter, and build gates.

### UPD-304 - Execute signed draft smoke matrix

- **Description:** Build disposable signed stable and beta draft series, then execute approved update and
  failure paths on macOS 15 Sequoia Apple Silicon, current Ubuntu LTS, and current Fedora stable. Record
  artifact tags, environments, results, and failures without committing secrets.
- **Acceptance Criteria:**
  - [ ] Stable upgrade passes on all three environments.
  - [ ] Beta upgrade passes on all three environments.
  - [ ] Newer stable reaches beta users.
  - [ ] Beta-to-stable downgrade passes on all three environments.
  - [ ] Manual channel rollback passes on all three environments.
  - [ ] Unreachable manifest, invalid signature, interrupted download, and read-only AppImage preserve
        launchable current version.
  - [ ] Initial macOS Gatekeeper approval does not recur across at least two self-updates.
- **Validation / Verification:**
  - _How to verify:_ Complete release checklist with screenshots/log excerpts containing no private data.
    Any repeated macOS warning blocks v1 and reopens signing policy.

### UPD-305 - Perform public-release readiness audit

- **Description:** Verify public-source state, secret hygiene, immutable artifacts, Pages URLs, recovery
  guide, key backup, and rollback workflow before first production tag.
- **Acceptance Criteria:**
  - [ ] Repository contains no private keys, credentials, personal vault data, or sensitive paths.
  - [ ] Updater public key matches private release key through disposable signature verification.
  - [ ] Offline private-key backup recovery is tested.
  - [ ] Stable and beta URLs return valid signed manifests.
  - [ ] Every referenced artifact URL is public and immutable.
  - [ ] Draft review and manual publication controls work with repository permissions.
  - [ ] Release owner accepts documented key-loss manual-reinstall recovery.
- **Validation / Verification:**
  - _How to verify:_ Run secret scan, public clone build, manifest validator, artifact URL checks, updater
    signature verification, rollback drill, and final release checklist review.
