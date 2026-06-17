---
name: merge
description: Squash-merge the current feature branch into main, auto-generate a commit message, and delete the branch.
argument-hint: "(none — run from your feature branch)"
---

# Merge

Squash-merge the current branch into `main` with an auto-generated commit message, then delete the feature branch.

The current branch is: !`git branch --show-current`. This should be referred to as $BRANCH.

The git log since main is: !`git log main..HEAD --oneline`.

## Workflow

1. **Pre-flight checks.** Run both of these before touching anything:
   - Current branch must not be `main`. If it is, stop and tell the user.
   - Current branch name must start with `feat/`. If it does not, stop and tell the user — do not proceed on arbitrary branch names.

2. **Draft a commit message.**
   Synthesize a single conventional-commit line (e.g. `feat: ...`, `fix: ...`, `chore: ...`) that summarises the work as the first line of the commit message, then add a one or two sentence description of the change in the body.

3. **Switch to main and squash-merge.**
   ```bash
   git checkout main
   git merge --squash "$BRANCH"
   ```

4. **Commit with the confirmed message.**
   Use the project's `gacm` alias so pre-commit hooks run:
   ```bash
   git add --all && git commit -m "<confirmed message>"
   ```
   If the commit fails (hook error, nothing to commit, etc.), report the error and stop — do not retry silently. Show the user the error message and let them fix it before trying again.

5. **Delete the feature branch.**
   ```bash
   git branch -D "$BRANCH"
   ```

6. Report success: branch merged and deleted.
