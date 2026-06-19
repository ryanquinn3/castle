---
name: writing-plans
description: Use when requirements are approved and a multi-step implementation plan is needed before code changes
---

# Writing Plans

Write implementation plans that make implementation predictable without adding unnecessary ceremony. A plan is a set of tasks that break down the work into clear steps. You should assume that a junior engineer will be executing the plan so err on the side of spelling it out. 

## Before Writing

1. Read `docs/agent-workflow.md`.
2. Confirm the user has approved the design or requirements.
3. Inspect current code and docs enough to name concrete files and risks.
4. Read any project-specific testing guidance that defines testing philosophy, test selection, or verification workflow.

## Where Plans Go

Prefer plan location and process specified by project instructions. If no instructions exist, default to `docs/plans/YYYY-MM-DD-<slug>.md`.


## Technical Overview

Before writing any tasks, write a **Technical Overview** section in the plan. This is a concise prose summary of the approach — no task numbers, no checklists. It should let the user understand and react to the design before committing to an execution order.

Include:

- **Approach**: the chosen design and why (key decisions, tradeoffs, alternatives ruled out).
- **Files and components touched**: which parts of the codebase change and how they relate.
- **Testing strategy**: what layers of tests cover this work (unit, integration, browser/e2e), why each layer was chosen, and any notable gaps or risks. Ground this in the project's testing guidance.

Keep the overview readable in 30 seconds. If the brainstorming session already settled these decisions, summarize them; if not, surface the open questions here rather than hiding them in task notes.

## Plan Contents

Use only the sections needed for the work:

- Goal
- Technical overview (always include — see above)
- Files to change
- Implementation tasks
- Documentation updates
- Acceptance criteria

## Task Quality

- Make each task independently understandable.
- Include exact file paths where possible.
- Prefer small, ordered steps over broad instructions.
- For non-trivial implementation changes, plan to use TDD unless project instructions explicitly say otherwise.
- The testing strategy belongs in the Technical Overview; tasks should reference it, not restate it.
- Include the verification command provided in the project instructions.
- Ensure documentation is up to date if task changes behavior or usage.
- Prefer committing each task atomically, but if not possible, break the implementation into logical commits that can be implemented independently.

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.
