---
name: verification-before-completion
description: Use before claiming implementation work is complete, fixed, passing, ready to commit, or ready for review
---

# Verification Before Completion

Evidence before completion claims.

## Workflow

1. Identify the claim you are about to make.
2. Identify the command or inspection that proves it.
3. Run the check fresh, unless the change is documentation-only and no command applies.
4. Report what passed, failed, or was not run.

## Castle Defaults

- Full verification: `node --run static-check`
- Unit tests only: `node --run test:unit`
- Browser tests: `node --run test:browser`
- Typecheck: `node --run tsc`

## Documentation-Only Changes

For docs or skill-only changes, inspect the changed files for:

- Broken paths
- Stale file references
- Contradictions with `AGENTS.md` or `docs/agent-workflow.md`
- Missing restart caveats for agent config or skill changes

Do not say tests pass unless a test command actually ran and passed.
