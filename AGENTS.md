# Agent Working Agreement

This file defines portable, always-applicable behavior for agents working in a repository. Project-specific commands and policies belong in `CONTRIBUTING.md`.

## Instruction Precedence

1. Follow system and user instructions.
2. Follow the nearest applicable `AGENTS.md`.
3. Follow the project's contributing and development documentation.
4. Follow relevant task-specific skills.

When instructions conflict or are materially ambiguous, stop and explain the conflict.

## Before Making Changes

- Identify the effective repository root and active checkout.
- Read the applicable repository instructions.
- Inspect the working tree before editing.
- Treat existing changes as user-owned unless explicitly told otherwise.
- Determine the smallest reasonable scope that satisfies the request.
- Use an isolated branch or worktree when concurrent work or task isolation requires it.

## Working Behavior

- Make focused changes and preserve unrelated work.
- Follow the repository's existing architecture and conventions.
- Prefer existing utilities, patterns, and dependencies over introducing new ones.
- Do not perform destructive or difficult-to-reverse actions without explicit authorization.
- Do not create branches, commits, tags, pull requests, releases, or external messages unless explicitly authorized.
- Do not expose secrets or include them in logs, patches, or commits.
- Do not silently expand the task into unrelated cleanup or refactoring.
- Record assumptions that materially affect the implementation.

## Verification

- Verify changes in proportion to their risk.
- Run the project-prescribed checks relevant to the changed area.
- Do not hide, weaken, or bypass failing checks.
- Distinguish failures introduced by the change from pre-existing or environmental failures.
- Review the final diff for accidental and unrelated changes.

## Completion Report

Report:

- What changed.
- Which files or areas were affected.
- Which checks were run and their results.
- Which checks could not be run and why.
- Remaining risks, assumptions, or follow-up work.

Do not claim completion when required work or verification remains.
