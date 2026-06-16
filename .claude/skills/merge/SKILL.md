---
name: merge
description: Squash-merge the current feature branch into main, auto-generate a commit message, and delete the branch.
argument-hint: "(none — run from your feature branch)"
---

# Merge

Squash-merge the current branch into `main` with an auto-generated commit message, then delete the feature branch.

## Workflow

1. **Pre-flight checks.** Run both of these before touching anything:
   - Current branch must not be `main`. If it is, stop and tell the user.
   - Current branch name must start with `feat/`. If it does not, stop and tell the user — do not proceed on arbitrary branch names.

2. **Capture the branch name.**
   ```bash
   BRANCH=$(git branch --show-current)
   ```

3. **Draft a commit message.**
   - Read the branch name and the log of commits since `main`:
     ```bash
     git log main..HEAD --oneline
     ```
   - Synthesize a single conventional-commit line (e.g. `feat: ...`, `fix: ...`, `chore: ...`) that summarises the work. Do not use a list — one line only.
   - Show the user the proposed message and ask them to confirm or edit it before proceeding.

4. **Switch to main and squash-merge.**
   ```bash
   git checkout main
   git merge --squash "$BRANCH"
   ```

5. **Commit with the confirmed message.**
   Use the project's `gacm` alias so pre-commit hooks run:
   ```bash
   gacm "<confirmed message>"
   ```
   If the commit fails (hook error, nothing to commit, etc.), report the error and stop — do not retry silently.

6. **Delete the feature branch.**
   ```bash
   git branch -d "$BRANCH"
   ```

7. Report success: branch merged and deleted, commit hash from `git log -1 --oneline`.
