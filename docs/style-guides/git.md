# Git, Branching, and Commit Style Guide

This document establishes the repository, branching, commit messaging, and merging standards for the Octarine codebase.

---

## 🌿 Git Branch Naming Rules

All branch names must be lowercase, use hyphens to separate words, and adhere strictly to the following prefix structures:

| Branch Prefix | Purpose | Naming Format | Example |
| :--- | :--- | :--- | :--- |
| **Features** | New atomic functionalities linked to a GitHub Issue | `feature/[ID-]<name>` | `feature/41-markdown-parser` |
| **Bugfixes** | Defect resolutions linked to a GitHub Bug Issue | `bugfix/[ID-]<name>` | `bugfix/102-sqlite-wal-concurrency` |
| **Releases** | Grouping of milestone features before merging to main | `release/<name>` | `release/v1.0-alpha` |
| **Hotfixes** | Urgent production fixes targeting main directly | `hotfix/[ID-]<name>` | `hotfix/104-ipc-deadlock` |
| **No-Tasks** | Small chore or refactoring tasks with no associated issue | `notask/<name>` | `notask/refactor-imports` |

### Key Naming Rules:
1. **Lowercase Only:** Never use uppercase letters in branch names.
2. **Include GitHub ID:** If an issue exists on GitHub (e.g. Issue #41), the branch name **must** start with the numeric ID directly after the prefix (e.g., `feature/41-parser`).
3. **Hyphen Separators:** Use hyphens (`-`) rather than underscores (`_`) or spaces.

---

## 🛠️ Worktree Isolation Standard (with Submodule Recursing)

To maintain a clean and reliable local development state, all task-specific development must occur inside a dedicated **Git Worktree**. The parent directory is reserved strictly for orchestration.

Because the repository utilizes git submodules (such as `.agents/`), each newly added worktree will initially contain empty submodule folders. You **must** initialize and update them explicitly inside the new directory to ensure all scripts and skills function.

### Worktree & Submodule Workflow Commands:

#### 1. Creation & Initialization:
Create and check out the branch in a sibling directory, then initialize its submodules:
```bash
# Create the branch and register the new worktree
git branch feature/[ID-]<name>
git worktree add ../feature-[name] feature/[ID-]<name>

# Navigate into the new worktree and initialize submodules
cd ../feature-[name]
git submodule update --init --recursive
```
*Tip:* To avoid re-downloading submodule commit history over the network, you can reference your main directory's cache:
`git submodule update --init --recursive --reference ../Octarine`

#### 2. Local Recursing Configuration:
Configure git inside your worktree to automatically recurse into submodules for checkouts and pulls:
```bash
git config submodule.recurse true
```

#### 3. Safe Cleanup & Removal:
Because submodules contain checked-out files, a standard `git worktree remove` may block. De-initialize submodules before cleaning up:
```bash
# From within the worktree directory, de-initialize all submodules safely
git submodule deinit --all -f

# Navigate back to your main repository directory and remove the worktree
cd ../Octarine
git worktree remove ../feature-[name]
git branch -d feature/[ID-]<name>
git worktree prune
```

---

## ✉️ Conventional Commit Standards

We utilize the **Conventional Commits 1.0.0** specification to maintain a clean, machine-readable repository history.

### Commit Format:
```text
<type>(<scope>): <short description in imperative present-tense>

[optional body describing the "why" and "what" in detail]

[optional footer referencing the issue number, e.g., Closes #ID]
```

### Types:
- **`feat`**: A new user-facing or technical feature.
- **`fix`**: A bug resolution.
- **`docs`**: Changes strictly to documentation.
- **`refactor`**: Code changes that neither fix a bug nor add a feature.
- **`perf`**: Performance optimizations.
- **`test`**: Adding missing tests or correcting existing tests.
- **`chore`**: Maintenance, package updates, or tooling configuration.

### Scope:
The scope must specify the logical module affected, such as `(parser)`, `(db)`, `(frontend)`, `(ipc)`, or `(docs)`.

### Example Commit:
```text
feat(parser): implement line-shift resilient content hashing

This implementation maps lines using content and location hashes, allowing 
seamless synchronization when files are edited concurrently.

Closes #41
```

---

## 🏁 Pull / Merge Request Gating

1. **Targeting:** Feature and bug branches must target `develop` or the active `release/` branch.
2. **Review Requirement:** All MRs must be peer-reviewed thoroughly, utilizing line-by-line comments for constructive code quality feedback.
3. **Squash Merges:** Always squash commits when merging feature or bug branches into target release/develop branches to maintain a linear git history.
