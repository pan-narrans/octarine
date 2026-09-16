# Git and Worktree Policy

This guide defines Octarine's project-specific Git policy. General authorization and safety behavior is defined in the root `AGENTS.md`.

## Authorization

Agents must not create or remove branches or worktrees, commit, amend, rebase, merge, tag, push, or open a pull request unless explicitly authorized. Authorization for one operation does not imply authorization for later history-changing operations.

## Worktree Ownership

- The directory containing `CONTRIBUTING.md` is the effective repository root.
- Run searches, builds, tests, and edits only inside the active worktree.
- At most one writing agent owns a worktree at a time.
- Concurrent writing agents require separate branches and worktrees.
- Read-only inspection may be shared.
- Never edit a sibling worktree unless explicitly requested.
- Initialize `.agents` after creating a worktree with `git submodule update --init --recursive`.
- Remove a worktree only after its work is integrated or explicitly abandoned.

## Branch Model

`master` is only permanent branch. It represents source of latest stable release. Direct work and
direct pushes are forbidden.

Protected `release/<version>` branches integrate selected work for specific releases. Example:
`release/0.1.0`. Do not include leading `v` in branch name. Multiple release branches may coexist
when versions require independent development.

No permanent `develop` branch exists. No permanent `beta` branch exists. Beta is release channel
represented by SemVer prerelease tags, GitHub prereleases, and `updates/beta.json`.

Short-lived work branches target selected release branch:

| Purpose           | Format                   | Example                      |
| ----------------- | ------------------------ | ---------------------------- |
| Feature           | `feature/<issue>-<slug>` | `feature/41-markdown-parser` |
| Fix               | `fix/<issue>-<slug>`     | `fix/102-watcher-race`       |
| Documentation     | `docs/<slug>`            | `docs/contributor-policy`    |
| Refactor          | `refactor/<slug>`        | `refactor/frontend-state`    |
| Maintenance       | `chore/<slug>`           | `chore/update-dependencies`  |
| Production hotfix | `hotfix/<issue>-<slug>`  | `hotfix/104-ipc-deadlock`    |

Use lowercase words separated by hyphens. Include issue number when one exists; otherwise omit it.
Create work branch from branch it targets. Feature selected for `0.1.0` branches from and returns to
`release/0.1.0`. Unscheduled work remains on its work branch or moves to another release through
explicit PR; never merge it into unrelated release branch as holding area.

Create new release branch from latest `master`, unless release explicitly depends on another active
release branch. Record exceptional base choice in first PR targeting that release.

## Pull Request Routing

| Source                                   | Target                       | Purpose                         |
| ---------------------------------------- | ---------------------------- | ------------------------------- |
| `feature/*`, `fix/*`, `refactor/*`       | selected `release/<version>` | Build selected release          |
| `docs/*`, `chore/*`                      | owning release, or `master`  | Scoped maintenance              |
| `release/<version>`                      | `master`                     | Promote verified stable release |
| `hotfix/*`                               | `master`                     | Repair published stable line    |
| `master` or hotfix follow-up work branch | affected active `release/*`  | Forward stable fix              |

Never commit directly to `master` or `release/*`. Every change reaches protected branch through PR.
Use GitHub term "pull request" (PR); merge request (MR) means same workflow on other platforms.

## Work-Start Checklist

Before editing:

1. Identify intended release version.
2. Confirm matching `release/<version>` exists and is correct base.
3. Create or select one short-lived work branch from that release branch.
4. Keep all commits for task on work branch.
5. Open PR back to same release branch when checks pass.

For repository-wide documentation or CI maintenance independent of application release, target
`master` through `docs/*` or `chore/*` PR. If target release is missing or ambiguous, stop and ask
which release owns work. Never fall back to `develop`.

## Release Selection and Concurrency

- Assign each feature to explicit release before opening PR.
- Target only that release branch.
- Develop unrelated features concurrently on separate short-lived branches or worktrees.
- Use separate `release/*` branches only for genuinely separate release trains.
- Do not cherry-pick feature commits between release branches by default. Open PR from suitable
  branch so CI, discussion, and ownership remain visible.
- Merge stabilization fixes into every affected active release through explicit PR.

Example:

```text
feature/p2p-server ──PR──> release/0.2.0 ──beta tags──> v0.2.0-beta.N
feature/search-v2  ──PR──> release/0.3.0 ──beta tags──> v0.3.0-beta.N
release/0.2.0      ──PR──> master        ──stable tag─> v0.2.0
```

Only one release line should normally feed public Beta channel at a time, even when multiple release
branches exist. Switching Beta release line is deliberate release decision.

## Protected Branch Rules

Apply ruleset to `master` and `release/**`:

- Require pull request before merge.
- Require Quality and Security status checks.
- Require branch up to date before merge.
- Require conversation resolution.
- Block force pushes and branch deletion.
- Do not allow administrator bypass.
- Require no approval count while repository has one maintainer; author cannot approve own PR.

Keep short-lived work branches unprotected so their owner can rebase them when needed. Never rewrite
shared branch without coordination.

## Commits

When a commit is authorized, use Conventional Commits:

```text
<type>(<scope>): <imperative summary>
```

Allowed types are `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`.

Examples:

```text
feat(parser): support nested task metadata
fix(watcher): wait for indexed file events
docs(contributing): clarify worktree ownership
```

- Use a focused logical change per commit.
- Use a body when motivation or trade-offs are not obvious.
- Reference issues in a footer such as `Closes #41` when applicable.
- Do not mix unrelated cleanup into functional commits.
- An agent reports the resulting commit hash.
- Do not amend, rebase, force-push, or rewrite existing commits without explicit authorization.

## Review and Merge

- Short-lived work branches are squash-merged after review.
- The squash message follows Conventional Commits.
- Release promotion into `master` uses merge commit to preserve release ancestry.
- Stable fixes are forwarded into active releases through PR.
- Required CI must be green before merge once configured.
- Review the final diff for unrelated changes, generated artifacts, secrets, and missing documentation.

## Tags

- Create annotated tags only after required CI and release review pass.
- Tag exact protected-branch tip being released.
- `v<version>-beta.<n>` tags belong to matching `release/<version>` branch.
- Stable `v<version>` tags belong to `master` after release promotion.
- Never move, recreate, or delete published release tag.
- Protect `v*` tags against updates and deletion.

## Reusable Skills

The `.agents` Git skill supplies procedures, not branch policy. It must use the values in this guide and remain subordinate to user authorization and `AGENTS.md`.
