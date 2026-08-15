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

## Branches Before First Production Deployment

`master` is the integration branch. Short-lived branches target `master`:

| Purpose           | Format                   | Example                      |
| ----------------- | ------------------------ | ---------------------------- |
| Feature           | `feature/<issue>-<slug>` | `feature/41-markdown-parser` |
| Fix               | `fix/<issue>-<slug>`     | `fix/102-watcher-race`       |
| Documentation     | `docs/<slug>`            | `docs/contributor-policy`    |
| Refactor          | `refactor/<slug>`        | `refactor/frontend-state`    |
| Maintenance       | `chore/<slug>`           | `chore/update-dependencies`  |
| Release           | `release/<version>`      | `release/v1.0.0`             |
| Production hotfix | `hotfix/<issue>-<slug>`  | `hotfix/104-ipc-deadlock`    |

Use lowercase words separated by hyphens. Include the issue number when one exists; otherwise omit it.

Before the first production deployment, activate the develop/release model in `../roadmap.md`. After that transition, `master` represents production.

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

- Short-lived task branches are squash-merged after review.
- The squash message follows Conventional Commits.
- Release and hotfix integration may preserve merge ancestry where useful.
- Required CI must be green before merge once configured.
- Review the final diff for unrelated changes, generated artifacts, secrets, and missing documentation.

## Reusable Skills

The `.agents` Git skill supplies procedures, not branch policy. It must use the values in this guide and remain subordinate to user authorization and `AGENTS.md`.
