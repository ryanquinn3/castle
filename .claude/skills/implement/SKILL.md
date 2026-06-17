---
name: implement
description: Use when asked to implement a backlog task by ID. Dispatches sonnet subagents to complete the task or each of its subtasks in dependency order, with parent-agent verification before marking work Done.
argument-hint: "Task ID (e.g. TASK-001 or 1.01)"
---

# Implement

Dispatch sonnet subagents to implement a backlog task sequentially.

If no task ID is provided when this skill is invoked, find the next backlog task in `To Do` state and ask the user whether that is the task they want you to work on before continuing. Do not start implementation until the user confirms the task.

## Workflow

1. Fetch the task: `backlog task <id> --plain`
2. If the task has **subtasks**:
   - Verify you are on the correct feature branch for this task family, using the `feat/<slug>` convention, and create or switch branches if needed before dispatching subagents
   - Mark the parent task `In Progress` before dispatching any subagents: `backlog task edit <id> -s "In Progress"`
   - Use TodoWrite to create one todo item per subtask
   - Fetch each subtask with `backlog task <subtask-id> --plain` to read its `Dependencies:` field
   - Determine execution order: a subtask may only start after every task it depends on is Done
   - Dispatch a sonnet Agent for each subtask in order, waiting for each to finish before starting the next
   - After each subagent returns, re-fetch the subtask with `backlog task <subtask-id> --plain`
   - Review the task state yourself: all Acceptance Criteria must be checked, the subagent must have set the status to `Complete`, and its summary/notes should match the work requested
   - If the task passes review, promote it to Done yourself: `backlog task edit <subtask-id> -s Done`
   - If the task fails review, dispatch the same subagent again with the specific gaps it must fix; do not continue to the next subtask until the current one passes review and is Done
   - Mark the corresponding todo Done only after the parent review passes and you have set the task to Done
   - Once every subtask is complete and verified, mark the parent task `Done`: `backlog task edit <id> -s Done`
3. If the task has **no subtasks**: dispatch a single sonnet Agent for the task itself, then perform the same parent review before setting it to Done

Always use `model: "sonnet"` on every Agent call.

## Subagent Prompt Template

Fill in `<TASK_ID>` with the actual task ID before dispatching:

---

You are implementing backlog task **<TASK_ID>** in this repository.

### Step 1 — Read context

```bash
backlog task <TASK_ID> --plain
```

Also read:
- `AGENTS.md` — architecture, core files, commands
- `docs/agent-workflow.md` — workflow and verification rules
- `docs/backlog-instructions.md` — task lifecycle CLI reference

### Step 2 — Verify branch

Before starting implementation, verify you are on the correct feature branch for this task using the `feat/<slug>` convention. If the right branch does not exist yet, create it. If you are on the wrong branch, switch to the correct one before continuing.

### Step 3 — Assign and start

```bash
backlog task edit <TASK_ID> -s "In Progress" -a @claude
```

### Step 4 — Implement

Work through each Acceptance Criterion in the task. Mark each one done as you complete it:

```bash
backlog task edit <TASK_ID> --check-ac <index>
```

Run `node --run static-check` after completing the implementation and confirm it passes.

### Step 5 — Verify before completion

Before marking the task `Complete`, verify both of these are true:

- Every Acceptance Criterion is satisfied in the project itself.
- Every Acceptance Criterion on the backlog task is checked off in the task metadata.

Re-read the task to confirm the backlog state matches the implementation:

```bash
backlog task <TASK_ID> --plain
```

Do not mark the task `Complete` until the implementation satisfies all ACs and the task itself has every AC marked complete.

### Step 6 — Wrap up

If all ACs are met in the project, all backlog ACs are checked, and static-check passes, write a final summary and mark the task `Complete`:

```bash
backlog task edit <TASK_ID> --final-summary "<what changed, why, tests run>"
backlog task edit <TASK_ID> -s Complete
```

### Scope discipline — when to stop

If you encounter flaky browser tests while working on the task, always leave an implementation note on the backlog task describing the flaky test behavior, what you observed, and any mitigation you tried:

```bash
backlog task edit <TASK_ID> --append-notes "Flaky browser test: <what failed, how it was flaky, mitigation attempted>"
```

If completing this task requires changes outside its Acceptance Criteria, **do not implement them**. Instead:

```bash
backlog task edit <TASK_ID> --append-notes "Blocked: <specific reason>"
backlog task edit <TASK_ID> -s Blocked
```

Then stop and surface the blocker to the user. Do not expand scope to unblock yourself.

---

## Notes

- This repo has no git worktrees. All subagents work on the current branch.
- Feature work should happen on branches named `feat/<slug>`. Verify the branch before starting work and create or switch if needed.
- Each subagent commits its own work. The verification command is `node --run static-check`.
- `Complete` means the subagent believes the task is finished and ready for parent review. Only the parent agent may promote a task from `Complete` to `Done`.
- Parent review is mandatory after every subagent run. Re-read the task and confirm ACs, status, and summary match reality before changing it to `Done`.
- If a subagent sets a task to Blocked, stop the sequence and report to the user rather than continuing to the next subtask.
