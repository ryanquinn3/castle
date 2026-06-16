---
name: systematic-debugging
description: Use when encountering a bug, test failure, unexpected behavior, regression, flaky result, or gameplay issue before proposing fixes
---

# Systematic Debugging

Find the root cause before fixing symptoms.

## Core Rule

No fixes until the failure is understood. Use `docs/agent-workflow.md` for where to record bug artifacts.

## Workflow

1. Capture the symptom precisely.
2. Reproduce it or explain why it cannot be reproduced yet.
3. Compare expected vs actual behavior.
4. Identify the boundary where behavior first diverges.
5. Trace inputs and outputs through that boundary.
6. Check recent changes to affected files.
7. State the root cause.
8. Only then propose and implement the smallest correct fix.
9. Verify the fix with the narrowest relevant test, then broader checks if needed.

## Useful Evidence

- Error output and stack traces
- Failing test name and assertion
- Screenshots or visual symptoms
- Game mode, phase, level, wave number, and player actions
- Debug JSON copied with `D` in-game
- Recent `git diff` and relevant commit history

## Castle-Specific Pointers

- Gameplay design: `docs/gameplay.md`
- Classic session: `src/level-session.ts`
- Tide session: `src/tide-session.ts`
- Terrain model: `src/model/grid-model.ts` and `src/model/terrain/`
- Wave runtime: `src/wave/wave-field-runtime.ts`
- Wave feedback: `src/wave/wave-terrain-feedback.ts`
- Wave erosion: `src/wave/wave-erosion.ts`
- Planning input: `src/view/planning-phase.ts` and `src/view/terrain-editor.ts`
- HUD and overlays: `src/view/`, `src/ui/`

## Bug Writeups

Use `docs/bugs/YYYY-MM-DD-<slug>.md` for substantial investigations unless Backlog.md is active for the task. Include:

- Problem
- Reproduction
- Root cause
- Solution
- Files to change
- Verification

## Avoid

- Guessing fixes from symptoms
- Bundling unrelated refactors into a bug fix
- Claiming the bug is fixed without fresh verification
- Asking the user to verify something you can reproduce or inspect yourself
