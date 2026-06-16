# Agent Workflow

This file is the repo-local tuning surface for agent workflow. Core skills should stay tool-agnostic and consult this file for the current project style.

## General Policy

- Adopt Backlog-at-plan-boundary as the default workflow for substantive work.
- `brainstorming` happens first to clarify scope, constraints, tradeoffs, and approval.
- Core skills should not hardcode Backlog.md behavior. They should read this file and adapt.
- Once the user approves the shaped request, the planning step should create or update the appropriate Backlog.md task structure.
- For non-trivial work, prefer one parent task with subtasks for implementation units.
- For small, tightly scoped work, a single task without subtasks is fine.

## Collaboration Style

- Collaborate before implementation when the request changes behavior, architecture, gameplay, workflow, or project conventions.
- Keep the collaboration lightweight. Small, obvious edits can use a short design summary and proceed after approval.
- Ask one focused question at a time when requirements are unclear.
- Do not create ceremony just because a generic skill says to. Prefer the smallest process that keeps the work correct and reviewable.

## Planning

- The detailed implementation plan lives in the Backlog parent task by default.
- The parent task must always include an implementation plan summary in the Backlog `Implementation Plan` field.
- That summary should explain the intended execution order, major work slices, key file areas, and the relationship between parent and subtasks.
- Once a plan is fleshed out, map that plan to a single Backlog parent task.
- Each implementation task in that plan should become a Backlog subtask unless the work is small enough to stay as a single task.
- Every leaf task, meaning any subtask or any task without subtasks, must include an Acceptance Criterion requiring an atomic git commit for that task's scoped change.
- Planning is the boundary where Backlog.md becomes mandatory for substantive work.
- Keep plans proportional to risk:
  - Small single-file changes: short plan in the Backlog task is enough after user approval.
  - Multi-file or gameplay changes: create parent task plus subtasks with concrete file and verification details.
  - Architectural or workflow changes: include alternatives, tradeoffs, and explicit acceptance criteria in Backlog.
- Plans should name exact files likely to change, key risks, tests to run, and docs to update.
- Plans should also define dependency relationships so execution order is unambiguous.
- Plans should be decomposed so each leaf task can end in an independently green state: its scoped tests pass, lint/typecheck are clean, there are no unused variables, and it does not depend on a later task to restore the repo to a good state.

## Task Tracking

- Backlog.md is the default durable task system for substantive work in this repo. Read `docs/backlog-instructions.md` for full guide on using the CLI.
- During early discovery, conversation plus `todowrite` is fine before a Backlog task exists.
- After approval, use Backlog CLI for task creation, updates, acceptance criteria, implementation notes, comments, final summary, labels, and status changes.
- A fleshed-out plan should have a visible task mapping in Backlog: parent task for the overall plan, subtasks for the plan's execution units.
- When using parent tasks and subtasks, record task dependencies so it is clear which tasks block others and which can run in parallel.
- Implementation work should happen on feature branches named `feat/<slug>`.
- Beginning a task includes verifying you are on the correct `feat/` branch for that work and creating or switching to it if needed before making changes.
- Never edit Backlog task files directly.
- Do not duplicate a separate `docs/plans/` artifact when the Backlog parent task already contains the plan.
- Standalone docs in `docs/plans/` or `docs/bugs/` are exceptions and should only be created when explicitly requested.

## Bugs

- Bugs are Backlog-first too.
- Use a bug label in Backlog for bug work.
- Start with reproduction and root cause, not fixes.
- Debug JSON from the game is high-value evidence. Press `D` in-game to copy board state as JSON.
- Only create a standalone `docs/bugs/` writeup if explicitly requested.

## Verification

- Before claiming implementation work is complete, run `node --run static-check` unless the change is documentation-only or the user asks not to.
- Parent tasks should verify that every leaf task includes an Acceptance Criterion for an atomic git commit.
- A leaf task is not complete unless its scoped change is independently green before any dependent follow-on task starts.
- For documentation-only or skill-only changes, inspect the changed files and check for obvious broken references.
- If verification cannot be run, state what blocked it and what was verified instead.

## Project-Specific Defaults

- The dev server is normally already running. Do not start another one.
- Gameplay changes must update `docs/gameplay.md` in the same change.
- Use Context7 docs for Excalibur.js questions before relying on memory.
- This repo is not set up for git worktrees. Do not create worktrees.
