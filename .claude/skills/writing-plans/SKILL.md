---
name: writing-plans
description: Use when requirements are approved and a multi-step implementation plan is needed before code changes
---

# Writing Plans

Write implementation plans that make implementation predictable without adding unnecessary ceremony. A plan is a set of tasks that break down the work into clear steps.

## Before Writing

1. Read `docs/agent-workflow.md`.
2. Confirm the user has approved the design or requirements.
3. Inspect current code and docs enough to name concrete files and risks.

## Where Plans Go

Prefer plan location and process specified by project instructions. If no instructions exist, default to `docs/plans/YYYY-MM-DD-<slug>.md`.


## Plan Contents

Use only the sections needed for the work:

- Goal
- Context
- Decisions and tradeoffs
- Files to change
- Implementation tasks
- Tests and verification
- Documentation updates
- Acceptance criteria

## Task Quality

- Make each task independently understandable.
- Include exact file paths where possible.
- Prefer small, ordered steps over broad instructions.
- Include the verification command provided in the project instructions.
- Ensure documentation is up to date if task changes behavior or usage.
- Prefer committing each task atomically, but if not possible, break the implementation into logical commits that can be implemented independently.

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.
