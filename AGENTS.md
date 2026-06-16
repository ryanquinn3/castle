# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Rules of engagement

- Always collaborate with the user before jumping into implementation.
- Workflow preferences live in `docs/agent-workflow.md`; consult it when planning, debugging, writing skills, or choosing where task artifacts belong.

## Docs

- Main gameplay design doc: `docs/gameplay.md`.
- Design docs, implementation plans, and proposals belong in `docs/plans/`.
- Notes and research that are not plans belong in `docs/notes/`.
- Bug writeups and investigation artifacts belong in `docs/bugs/`.
- When making gameplay changes, update `docs/gameplay.md` in the same change.

## Gameplay Overview

Wave defense game. Each level has two phases:

1. **Planning phase** - player selects a non-castle cell, moves the selection with arrow keys, and applies context-valid shovel, wall, or tower actions to reshape terrain
2. **Wave phase** - water advances from the top of the grid downward; terrain elevation reduces wave height

**Core mechanic**: Shovel digs the selected cell and adds 1 sand. Walls are built in four stacked levels (L1-L4) at costs 1/5/10/20 sand; each level can only be placed on the level below it (L1 on flat ground only). Tower places a fixed height-15 tower on selected flat ground for 15 sand. In Classic, only shovel actions consume the finite planning budget; Tide planning is countdown-based. Walls reduce incoming wave height; holes absorb it. Towers erode after 10 hits instead of 3. Water that reaches the castle tile ends the game.

Full design doc: `docs/gameplay.md`.

## Commands

A dev server is always running in the background. Do not start one.

To run all code check tools including tests, linter, typecheck etc use the following command: `node --run static-check`.

This command runs the full verification suite. This is run before a commit can be made to the repo.

## Architecture

Excalibur.js game (TypeScript + Vite).

Use context7 mcp to read docs on the excaliburjs engine. We should always aim to write idiomatic code with the framework.

### Core files

**Keep this list up to date when making core changes**

- **`src/main.ts`** - Thin bootstrap that calls `startGame("game")`
- **`src/engine.ts`** - Creates the Engine (FillScreen, pixel-art), registers scenes (`title`, `game`, `tide`), and starts the game on the title scene
- **`src/level-session.ts`** - Classic level-mode scene. Owns the loop: planning phase, `WaveFieldRuntime` wave simulation, win/loss checks
- **`src/tide-session.ts`** - Tide-mode scene. Runs continuous timed waves via `WaveFieldRuntime`, countdowns, high score, planning lockout, win/loss checks
- **`src/title-scene.ts`** - React-backed title screen with Classic and Tide mode selection
- **`src/config.ts`** - All game constants (grid size, scoop budget, wave params, tile size, layout)
- **`src/resources.ts`** - Asset loading; exports `Resources`, `loader`, and Tiled map

### Model layer (`src/model/`)

- **`terrain/terrain.ts`** - Terrain base class and shared types. Each terrain is an Excalibur `Actor`: it owns its transform (positioned from col/row in `attach`), a tile-sized `CollisionType.Passive` collider (dormant; reserved for future wave/terrain physics), and self-renders via `syncGraphic()` (canvas cached by `cacheKey`). Each instance knows its live cardinal neighbors (`get neighbors`) and can report adjacency with `connectsTo(other)`.
- **`terrain/flat-ground.ts`**, **`terrain/hole.ts`**, **`terrain/wall.ts`**, **`terrain/tower.ts`** - Terrain implementations. Each type owns elevation, sprite/render info, water interaction, erosion, mutation behavior, and serialization (`serialize()`). Walls render procedurally as a **contiguous mass** using grid-anchored per-tier textures and edge decoration; holes derive edge flags from neighbors.
- **`grid-model.ts`** - The single grid container. Holds the `Terrain[][]` actor grid, pool detection, tower placement, sand redistribution, projection helpers, and debug serialization. Takes the `Scene` and adds/removes terrain actors to it: `setCell` swaps the actor when a cell's type changes (detected by `applyDelta` returning a new instance) and refreshes the changed cell + neighbors via `syncGraphic()`. Implements `NeighborGrid` (`neighborsOf`); every cell assignment routes through `setCell` so each terrain is attached for neighbor lookups
- **`inventory-model.ts`** - Sand inventory used by digging, wall placement, and tower placement
- **`wave-simulation.ts`** - Exports `generateWaveCurve`; consumed by `wave-spawner.ts` to build per-column peak heights

### Wave runtime (`src/wave/`)

- **`wave-event-applier.ts`** - Applies erosion and flood events back into the terrain actor grid (`GridModel`) and sand-layer state. The `eroded` event routes to `GridModel.applyErosionHits`; hole pooling and castle flooding wire through `WaveTerrainFeedback`.
- **`wave-field-runtime.ts`** - The wave runtime. Builds the overlay, registers dynamic + render systems, and resolves when no water remains. Wires `WaveEventApplier` for hole pooling and castle flooding and for wall/tower erosion via `eroded` events from the projected flux vector. Owns a `fieldEvents` emitter (`WaterFieldEvents`, defined in `wave-dynamic-system.ts`); the per-wave `WaveDynamicSystem` emits `WaterCellAdded` as cells become wet, and sessions subscribe to drive `SandLayer.coverCell` (the moist-sand wetness effect).
- **`wave-spawner.ts`** - Builds deterministic per-column wave spawn data from peak-height inputs
- **`wave-terrain-feedback.ts`** - Pure post-flux terrain feedback: holes absorb resting water into `puddleDepth` (finite capacity) and a wet castle cell flags a flood. Consumed by `WaveFieldRuntime` via `WaveDynamicSystem`'s `onResolveCells` hook.
- **`wave-erosion.ts`** - Pure flux-projection erosion: projects each wet cell's velocity onto adjacent wall/tower faces (frontal vs shear), accumulates per-face charge across frames, and emits discrete `eroded` hit counts. Consumed by `WaveFieldRuntime` inside the `onResolveCells` hook.

### View layer (`src/view/`)

Terrain rendering now lives on the terrain actors themselves (`Terrain.syncGraphic()` in the model layer); there is no separate tile/grid view actor. `GridModel` owns the actor grid directly.

- **`planning-phase.ts`** - Coordinates planning state, HUD text, tool selection, wave reach indicator, and `TerrainEditor` lifecycle
- **`terrain-editor.ts`** - Selection-based planning input: tracks the selected cell, moves it with arrow keys, renders the selection highlight, and applies dig/wall/tower edits with context-sensitive tool validity
- **`toolbar.ts`** - React-backed tool selector and sand cost UI bridge
- **`erosion-flash.ts`** - Standalone `flashErodedTiles` helper; flashes eroded terrain tiles after each wave, used by both sessions
- **`hud.ts`** - HUD display (scoop budget, wave count, level info)
- **`tide-hud.ts`** - Tide mode HUD display (wave count, sand, countdown, best score)
- **`screen-overlays.ts`** - Banners, level complete, game over overlays
- **`castle-actor.ts`** - Standalone castle overlay actor (spans the castle footprint) plus the `placeCastle()` helper sessions use to (re)place it; the underlying castle cells stay `FlatGround` in the grid, edit-guarded by `isCastle`

### UI layer (`src/ui/`)

- React components and CSS for the title menu, HUDs, sand counter, toolbar, and tool cost badges. Excalibur scenes mount these into `#game-ui`.

### Game modes (`src/modes/`)

- **`game-mode.ts`** - GameMode interface and GameState type
- **`level-mode.ts`** - Per-level state machine (planning, wave, between-waves)
- **`tide-mode.ts`** - Continuous tide-mode wave progression and score state

## Sound

All sound playback must go through `playSound()` from `src/sound.ts`, never call `.play()` directly on a Sound resource. The helper checks the `__SOUNDS_DISABLED__` compile-time flag (set `true` in `vitest.config.ts`) so tests skip audio entirely and avoid jsdom's incomplete Audio support.

## Testing

See `docs/testing.md` for the unit-vs-browser decision rule, the two Vitest projects, the shared browser fixture, and screenshot capture. Tests are co-located with source (`*.test.ts` / `*.browser.test.ts`).

## Debug Serialization

Press **D** at any time to copy the board state as JSON to the clipboard. The format:

```json
{
  "castle": { "col": 7, "row": 11, "width": 2, "height": 2 },
  "cells": [
    [{ "type": "wall", "height": 10, "level": 2, "hp": 45 }, { "type": "hole", "height": -2, "puddleDepth": 1.5 }, { "type": "tower", "height": 15 }],
    [{ "type": "flat", "height": 0 }, { "type": "flat", "height": 0 }, { "type": "flat", "height": 0 }]
  ],
  "columnHeights": [3.2, 2.8, 4.1]
}
```

- `castle` - castle grid position and dimensions.
- `cells` - 2D grid, row-major. Each cell has `type` (flat/wall/hole/tower), `height`, and optional fields (e.g. `puddleDepth` for holes). Walls also serialize `level` (1-4) and `hp` (current durability); `height` is the derived blocking elevation (5/10/15/20).
- `columnHeights` - per-column wave heights from last wave (empty array if no wave has run).

> The standalone `tools/replay-wave.ts` replay script was retired in the terrain→Actor migration: terrain now imports Excalibur (which requires a browser `window`) and can no longer be loaded in pure Node. Use the debug JSON to reconstruct state and trace the wave runtime, or rebuild an actor-driven replay harness (running under the browser Vitest project) if needed.

## Vite Config Notes

- Custom plugin externalizes `.tsx` Tiled tileset files (avoids React/JSX conflict)
- Excalibur excluded from dep optimization (CJS/ESM issue)
- Assets not inlined (`assetsInlineLimit: 0`) due to Excalibur XML limitation
- `base: './'` for relative paths

## Temporary files

Use `./.tmp` for temporary files instead of `/tmp`.

## No worktrees

This repo is not set up for git worktrees so always work on the current branch / checkout.

<!-- BACKLOG.MD GUIDELINES START -->
# Instructions for the usage of Backlog.md CLI Tool

## Backlog.md: Comprehensive Project Management Tool via CLI

### Assistant Objective

Efficiently manage all project tasks, status, and documentation using the Backlog.md CLI, ensuring all project metadata
remains fully synchronized and up-to-date.

### Core Capabilities

- ✅ **Task Management**: Create, edit, assign, prioritize, and track tasks with full metadata
- ✅ **Search**: Fuzzy search across tasks, documents, and decisions with `backlog search`
- ✅ **Acceptance Criteria**: Granular control with add/remove/check/uncheck by index
- ✅ **Definition of Done checklists**: Per-task DoD items with add/remove/check/uncheck
- ✅ **Board Visualization**: Terminal-based Kanban board (`backlog board`) and web UI (`backlog browser`)
- ✅ **Git Integration**: Automatic tracking of task states across branches
- ✅ **Dependencies**: Task relationships and subtask hierarchies
- ✅ **Documentation & Decisions**: Structured docs and architectural decision records
- ✅ **Export & Reporting**: Generate markdown reports and board snapshots
- ✅ **AI-Optimized**: `--plain` flag provides clean text output for AI processing

### Why This Matters to You (AI Agent)

1. **Comprehensive system** - Full project management capabilities through CLI
2. **The CLI is the interface** - All operations go through `backlog` commands
3. **Unified interaction model** - You can use CLI for both reading (`backlog task 1 --plain`) and writing (
   `backlog task edit 1`)
4. **Metadata stays synchronized** - The CLI handles all the complex relationships

### Key Understanding

- **Tasks** live in `backlog/tasks/` as `task-<id> - <title>.md` files
- **You interact via CLI only**: `backlog task create`, `backlog task edit`, etc.
- **Use `--plain` flag** for AI-friendly output when viewing/listing
- **Never bypass the CLI** - It handles Git, metadata, file naming, and relationships

---

# ⚠️ CRITICAL: NEVER EDIT TASK FILES DIRECTLY. Edit Only via CLI

**ALL task operations MUST use the Backlog.md CLI commands**

- ✅ **DO**: Use `backlog task edit` and other CLI commands
- ✅ **DO**: Use `backlog task create` to create new tasks
- ✅ **DO**: Use `backlog task edit <id> --check-ac <index>` to mark acceptance criteria
- ❌ **DON'T**: Edit markdown files directly
- ❌ **DON'T**: Manually change checkboxes in files
- ❌ **DON'T**: Add or modify text in task files without using CLI

**Why?** Direct file editing breaks metadata synchronization, Git tracking, and task relationships.

---

## 1. Source of Truth & File Structure

### 📖 **UNDERSTANDING** (What you'll see when reading)

- Markdown task files live under **`backlog/tasks/`** (drafts under **`backlog/drafts/`**)
- Files are named: `task-<id> - <title>.md` (e.g., `task-42 - Add GraphQL resolver.md`)
- Project documentation is in **`backlog/docs/`**
- Project decisions are in **`backlog/decisions/`**

### 🔧 **ACTING** (How to change things)

- **All task operations MUST use the Backlog.md CLI tool**
- This ensures metadata is correctly updated and the project stays in sync
- **Always use `--plain` flag** when listing or viewing tasks for AI-friendly text output
- Create and update project docs through Backlog.md APIs so frontmatter and paths stay valid. For CLI users, run `backlog doc create "Title" -p guides/setup` or `backlog doc update doc-1 --content "Updated markdown"`; MCP users should use `document_create` / `document_update`.
- Document paths are relative to `backlog/docs/`; absolute paths and `..` traversal are rejected.

---

## 2. Common Mistakes to Avoid

### ❌ **WRONG: Direct File Editing**

```markdown
# DON'T DO THIS:

1. Open backlog/tasks/task-7 - Feature.md in editor
2. Change "- [ ]" to "- [x]" manually
3. Add notes, comments, or final summary directly to the file
4. Save the file
```

### ✅ **CORRECT: Using CLI Commands**

```bash
# DO THIS INSTEAD:
backlog task edit 7 --check-ac 1  # Mark AC #1 as complete
backlog task edit 7 --notes "Implementation complete"  # Add notes
backlog task edit 7 --comment "Review question" --comment-author @agent-k  # Add comment
backlog task edit 7 --final-summary "PR-style summary"  # Add final summary
backlog task edit 7 -s "In Progress" -a @agent-k  # Multiple commands: change status and assign the task when you start working on the task
```

---

## 3. Understanding Task Format (Read-Only Reference)

⚠️ **FORMAT REFERENCE ONLY** - The following sections show what you'll SEE in task files.
**Never edit these directly! Use CLI commands to make changes.**

### Task Structure You'll See

```markdown
---
id: task-42
title: Add GraphQL resolver
status: To Do
assignee: [@sara]
labels: [backend, api]
modified_files:
  - src/server/api.ts
  - src/web/components/TaskList.tsx
---

## Description

Brief explanation of the task purpose.

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 First criterion
- [x] #2 Second criterion (completed)
- [ ] #3 Third criterion

<!-- AC:END -->

## Definition of Done

<!-- DOD:BEGIN -->

- [ ] #1 Tests pass
- [ ] #2 Docs updated

<!-- DOD:END -->

## Implementation Plan

1. Research approach
2. Implement solution

## Implementation Notes

Progress notes captured during implementation.

## Comments

Task discussion, review questions, and collaboration notes.

## Final Summary

PR-style summary of what was implemented.
```

### How to Modify Each Section

| What You Want to Change | CLI Command to Use                                       |
|-------------------------|----------------------------------------------------------|
| Title                   | `backlog task edit 42 -t "New Title"`                    |
| Status                  | `backlog task edit 42 -s "In Progress"`                  |
| Assignee                | `backlog task edit 42 -a @sara`                          |
| Labels                  | `backlog task edit 42 -l backend,api`                    |
| Description             | `backlog task edit 42 -d "New description"`              |
| Add AC                  | `backlog task edit 42 --ac "New criterion"`              |
| Add DoD                 | `backlog task edit 42 --dod "Ship notes"`                |
| Check AC #1             | `backlog task edit 42 --check-ac 1`                      |
| Check DoD #1            | `backlog task edit 42 --check-dod 1`                     |
| Uncheck AC #2           | `backlog task edit 42 --uncheck-ac 2`                    |
| Uncheck DoD #2          | `backlog task edit 42 --uncheck-dod 2`                   |
| Remove AC #3            | `backlog task edit 42 --remove-ac 3`                     |
| Remove DoD #3           | `backlog task edit 42 --remove-dod 3`                    |
| Add Plan                | `backlog task edit 42 --plan "1. Step one\n2. Step two"` |
| Add Notes (replace)     | `backlog task edit 42 --notes "What I did"`              |
| Append Notes            | `backlog task edit 42 --append-notes "Another note"` |
| Add Comment             | `backlog task edit 42 --comment "Review question" --comment-author @agent` |
| Add Final Summary       | `backlog task edit 42 --final-summary "PR-style summary"` |
| Append Final Summary    | `backlog task edit 42 --append-final-summary "Another detail"` |
| Clear Final Summary     | `backlog task edit 42 --clear-final-summary` |

---

## 4. Defining Tasks

### Creating New Tasks

**Always use CLI to create tasks:**

```bash
# Example
backlog task create "Task title" -d "Description" --ac "First criterion" --ac "Second criterion"
```

### Title (one liner)

Use a clear brief title that summarizes the task.

### Description (The "why")

Provide a concise summary of the task purpose and its goal. Explains the context without implementation details.

### Acceptance Criteria (The "what")

**Understanding the Format:**

- Acceptance criteria appear as numbered checkboxes in the markdown files
- Format: `- [ ] #1 Criterion text` (unchecked) or `- [x] #1 Criterion text` (checked)

**Managing Acceptance Criteria via CLI:**

⚠️ **IMPORTANT: How AC Commands Work**

- **Adding criteria (`--ac`)** accepts multiple flags: `--ac "First" --ac "Second"` ✅
- **Checking/unchecking/removing** accept multiple flags too: `--check-ac 1 --check-ac 2` ✅
- **Mixed operations** work in a single command: `--check-ac 1 --uncheck-ac 2 --remove-ac 3` ✅

```bash
# Examples

# Add new criteria (MULTIPLE values allowed)
backlog task edit 42 --ac "User can login" --ac "Session persists"

# Check specific criteria by index (MULTIPLE values supported)
backlog task edit 42 --check-ac 1 --check-ac 2 --check-ac 3  # Check multiple ACs
# Or check them individually if you prefer:
backlog task edit 42 --check-ac 1    # Mark #1 as complete
backlog task edit 42 --check-ac 2    # Mark #2 as complete

# Mixed operations in single command
backlog task edit 42 --check-ac 1 --uncheck-ac 2 --remove-ac 3

# ❌ STILL WRONG - These formats don't work:
# backlog task edit 42 --check-ac 1,2,3  # No comma-separated values
# backlog task edit 42 --check-ac 1-3    # No ranges
# backlog task edit 42 --check 1         # Wrong flag name

# Multiple operations of same type
backlog task edit 42 --uncheck-ac 1 --uncheck-ac 2  # Uncheck multiple ACs
backlog task edit 42 --remove-ac 2 --remove-ac 4    # Remove multiple ACs (processed high-to-low)
```

### Definition of Done checklist (per-task)

Definition of Done items are a second checklist in each task. Defaults come from `definition_of_done` in the project config file (`backlog/config.yml`, `.backlog/config.yml`, or `backlog.config.yml`) or from Web UI Settings, and can be disabled per task.

**Managing Definition of Done via CLI:**

```bash
# Add DoD items (MULTIPLE values allowed)
backlog task edit 42 --dod "Run tests" --dod "Update docs"

# Check/uncheck DoD items by index (MULTIPLE values supported)
backlog task edit 42 --check-dod 1 --check-dod 2
backlog task edit 42 --uncheck-dod 1

# Remove DoD items by index
backlog task edit 42 --remove-dod 2

# Create without defaults
backlog task create "Feature" --no-dod-defaults
```

**Key Principles for Good ACs:**

- **Outcome-Oriented:** Focus on the result, not the method.
- **Testable/Verifiable:** Each criterion should be objectively testable
- **Clear and Concise:** Unambiguous language
- **Complete:** Collectively cover the task scope
- **User-Focused:** Frame from end-user or system behavior perspective

Good Examples:

- "User can successfully log in with valid credentials"
- "System processes 1000 requests per second without errors"
- "CLI preserves literal newlines in description/plan/notes/comments/final summary; `\\n` sequences are not auto-converted"

Bad Example (Implementation Step):

- "Add a new function handleLogin() in auth.ts"
- "Define expected behavior and document supported input patterns"

### Task Breakdown Strategy

1. Identify foundational components first
2. Create tasks in dependency order (foundations before features)
3. Ensure each task delivers value independently
4. Avoid creating tasks that block each other

### Task Requirements

- Tasks must be **atomic** and **testable** or **verifiable**
- Each task should represent a single unit of work for one PR
- **Never** reference future tasks (only tasks with id < current task id)
- Ensure tasks are **independent** and don't depend on future work

---

## 5. Implementing Tasks

### 5.1. First step when implementing a task

The very first things you must do when you take over a task are:

* set the task in progress
* assign it to yourself

```bash
# Example
backlog task edit 42 -s "In Progress" -a @{myself}
```

### 5.2. Review Task References and Documentation

Before planning, check if the task has any attached `references` or `documentation`:
- **References**: Related code files, GitHub issues, or URLs relevant to the implementation
- **Documentation**: Design docs, API specs, or other materials for understanding context

These are visible in the task view output. Review them to understand the full context before drafting your plan.

### 5.3. Create an Implementation Plan (The "how")

Previously created tasks contain the why and the what. Once you are familiar with that part you should think about a
plan on **HOW** to tackle the task and all its acceptance criteria. This is your **Implementation Plan**.
First do a quick check to see if all the tools that you are planning to use are available in the environment you are
working in.
When you are ready, write it down in the task so that you can refer to it later.

```bash
# Example
backlog task edit 42 --plan "1. Research codebase for references\n2Research on internet for similar cases\n3. Implement\n4. Test"
```

## 5.4. Implementation

Once you have a plan, you can start implementing the task. This is where you write code, run tests, and make sure
everything works as expected. Follow the acceptance criteria one by one and MARK THEM AS COMPLETE as soon as you
finish them.

### 5.5 Implementation Notes (Progress log)

Use Implementation Notes to log progress, decisions, and blockers as you work.
Append notes progressively during implementation using `--append-notes`:

```
backlog task edit 42 --append-notes "Investigated root cause" --append-notes "Added tests for edge case"
```

```bash
# Example
backlog task edit 42 --notes "Initial implementation done; pending integration tests"
```

### 5.6 Final Summary (PR description)

When you are done implementing a task you need to prepare a PR description for it.
Because you cannot create PRs directly, write the PR as a clean summary in the Final Summary field.

**Quality bar:** Write it like a reviewer will see it. A one‑liner is rarely enough unless the change is truly trivial.
Include the key scope so someone can understand the impact without reading the whole diff.

```bash
# Example
backlog task edit 42 --final-summary "Implemented pattern X because Reason Y; updated files Z and W; added tests"
```

**IMPORTANT**: Do NOT include an Implementation Plan when creating a task. The plan is added only after you start the
implementation.

- Creation phase: provide Title, Description, Acceptance Criteria, and optionally labels/priority/assignee.
- When you begin work, switch to edit, set the task in progress and assign to yourself
  `backlog task edit <id> -s "In Progress" -a "..."`.
- Think about how you would solve the task and add the plan: `backlog task edit <id> --plan "..."`.
- After updating the plan, share it with the user and ask for confirmation. Do not begin coding until the user approves the plan or explicitly tells you to skip the review.
- Append Implementation Notes during implementation using `--append-notes` as progress is made.
- Add Final Summary only after completing the work: `backlog task edit <id> --final-summary "..."` (replace) or append using `--append-final-summary`.

## Phase discipline: What goes where

- Creation: Title, Description, Acceptance Criteria, labels/priority/assignee.
- Implementation: Implementation Plan (after moving to In Progress and assigning to yourself) + Implementation Notes (progress log, appended as you work).
- Wrap-up: Final Summary (PR description), verify AC and Definition of Done checks.

**IMPORTANT**: Only implement what's in the Acceptance Criteria. If you need to do more, either:

1. Update the AC first: `backlog task edit 42 --ac "New requirement"`
2. Or create a new follow up task: `backlog task create "Additional feature"`

---

## 6. Typical Workflow

```bash
# 1. Identify work
backlog task list -s "To Do" --plain

# 2. Read task details
backlog task 42 --plain

# 3. Start work: assign yourself & change status
backlog task edit 42 -s "In Progress" -a @myself

# 4. Add implementation plan
backlog task edit 42 --plan "1. Analyze\n2. Refactor\n3. Test"

# 5. Share the plan with the user and wait for approval (do not write code yet)

# 6. Work on the task (write code, test, etc.)

# 7. Mark acceptance criteria as complete (supports multiple in one command)
backlog task edit 42 --check-ac 1 --check-ac 2 --check-ac 3  # Check all at once
# Or check them individually if preferred:
# backlog task edit 42 --check-ac 1
# backlog task edit 42 --check-ac 2
# backlog task edit 42 --check-ac 3

# 8. Add Final Summary (PR Description)
backlog task edit 42 --final-summary "Refactored using strategy pattern, updated tests"

# 9. Mark task as done
backlog task edit 42 -s Done
```

---

## 7. Definition of Done (DoD)

A task is **Done** only when **ALL** of the following are complete:

### ✅ Via CLI Commands:

1. **All acceptance criteria checked**: Use `backlog task edit <id> --check-ac <index>` for each
2. **All Definition of Done items checked**: Use `backlog task edit <id> --check-dod <index>` for each
3. **Final Summary added**: Use `backlog task edit <id> --final-summary "..."`
4. **Status set to Done**: Use `backlog task edit <id> -s Done`

### ✅ Via Code/Testing:

5. **Tests pass**: Run test suite and linting
6. **Documentation updated**: Update relevant docs if needed
7. **Code reviewed**: Self-review your changes
8. **No regressions**: Performance, security checks pass

⚠️ **NEVER mark a task as Done without completing ALL items above**

---

## 8. Finding Tasks and Content with Search

When users ask you to find tasks related to a topic, use the `backlog search` command with `--plain` flag:

```bash
# Search for tasks about authentication
backlog search "auth" --plain

# Search only in tasks (not docs/decisions)
backlog search "login" --type task --plain

# Search with filters
backlog search "api" --status "In Progress" --plain
backlog search "bug" --priority high --plain

# Find tasks that modified a project file path
backlog search --modified-file src/server/api.ts --plain
```

**Key points:**
- Uses fuzzy matching - finds "authentication" when searching "auth"
- Searches task titles, descriptions, and content
- Also searches `modified_files`; `--modified-file` applies a case-insensitive path substring filter
- Also searches documents and decisions unless filtered with `--type task`
- Always use `--plain` flag for AI-readable output

---

## 9. Quick Reference: DO vs DON'T

### Viewing and Finding Tasks

| Task         | ✅ DO                        | ❌ DON'T                         |
|--------------|-----------------------------|---------------------------------|
| View task    | `backlog task 42 --plain`   | Open and read .md file directly |
| List tasks   | `backlog task list --plain` | Browse backlog/tasks folder     |
| Check status | `backlog task 42 --plain`   | Look at file content            |
| Find by topic| `backlog search "auth" --plain` | Manually grep through files |

### Modifying Tasks

| Task          | ✅ DO                                 | ❌ DON'T                           |
|---------------|--------------------------------------|-----------------------------------|
| Check AC      | `backlog task edit 42 --check-ac 1`  | Change `- [ ]` to `- [x]` in file |
| Add notes     | `backlog task edit 42 --notes "..."` | Type notes into .md file          |
| Add comment   | `backlog task edit 42 --comment "..." --comment-author @agent` | Type comment into .md file |
| Add final summary | `backlog task edit 42 --final-summary "..."` | Type summary into .md file |
| Change status | `backlog task edit 42 -s Done`       | Edit status in frontmatter        |
| Add AC        | `backlog task edit 42 --ac "New"`    | Add `- [ ] New` to file           |

---

## 10. Complete CLI Command Reference

### Task Creation

| Action           | Command                                                                             |
|------------------|-------------------------------------------------------------------------------------|
| Create task      | `backlog task create "Title"`                                                       |
| With description | `backlog task create "Title" -d "Description"`                                      |
| With AC          | `backlog task create "Title" --ac "Criterion 1" --ac "Criterion 2"`                 |
| With final summary | `backlog task create "Title" --final-summary "PR-style summary"`                 |
| With references  | `backlog task create "Title" --ref src/api.ts --ref https://github.com/issue/123`   |
| With documentation | `backlog task create "Title" --doc https://design-docs.example.com`               |
| With modified files | `backlog task create "Title" --modified-file src/api.ts --modified-file src/ui.ts` |
| With all options | `backlog task create "Title" -d "Desc" -a @sara -s "To Do" -l auth --priority high --ref src/api.ts --doc docs/spec.md --modified-file src/api.ts` |
| Create draft     | `backlog task create "Title" --draft`                                               |
| Create subtask   | `backlog task create "Title" -p 42`                                                 |

### Task Modification

| Action           | Command                                     |
|------------------|---------------------------------------------|
| Edit title       | `backlog task edit 42 -t "New Title"`       |
| Edit description | `backlog task edit 42 -d "New description"` |
| Change status    | `backlog task edit 42 -s "In Progress"`     |
| Assign           | `backlog task edit 42 -a @sara`             |
| Add labels       | `backlog task edit 42 -l backend,api`       |
| Set priority     | `backlog task edit 42 --priority high`      |

### Acceptance Criteria Management

| Action              | Command                                                                     |
|---------------------|-----------------------------------------------------------------------------|
| Add AC              | `backlog task edit 42 --ac "New criterion" --ac "Another"`                  |
| Remove AC #2        | `backlog task edit 42 --remove-ac 2`                                        |
| Remove multiple ACs | `backlog task edit 42 --remove-ac 2 --remove-ac 4`                          |
| Check AC #1         | `backlog task edit 42 --check-ac 1`                                         |
| Check multiple ACs  | `backlog task edit 42 --check-ac 1 --check-ac 3`                            |
| Uncheck AC #3       | `backlog task edit 42 --uncheck-ac 3`                                       |
| Mixed operations    | `backlog task edit 42 --check-ac 1 --uncheck-ac 2 --remove-ac 3 --ac "New"` |

### Task Content

| Action           | Command                                                  |
|------------------|----------------------------------------------------------|
| Add plan         | `backlog task edit 42 --plan "1. Step one\n2. Step two"` |
| Add notes        | `backlog task edit 42 --notes "Implementation details"`  |
| Add comment      | `backlog task edit 42 --comment "Review question" --comment-author @agent` |
| Add final summary | `backlog task edit 42 --final-summary "PR-style summary"` |
| Append final summary | `backlog task edit 42 --append-final-summary "More details"` |
| Clear final summary | `backlog task edit 42 --clear-final-summary` |
| Add dependencies | `backlog task edit 42 --dep task-1 --dep task-2`         |
| Add references   | `backlog task edit 42 --ref src/api.ts --ref https://github.com/issue/123` |
| Add documentation | `backlog task edit 42 --doc https://design-docs.example.com --doc docs/spec.md` |
| Set modified files | `backlog task edit 42 --modified-file src/api.ts --modified-file src/ui.ts` |

### Multi‑line Input (Description/Plan/Notes/Comments/Final Summary)

The CLI preserves input literally — shells do not convert `\n` inside normal quotes. Use one of the following forms, listed in order of preference for AI agents:

**1. Repeat `--append-*` for each line (works in every shell, including sandboxes that block other forms):**

```bash
backlog task edit 42 --notes "First line"
backlog task edit 42 --append-notes "Second line"
backlog task edit 42 --append-notes "Third line"
```

**2. Real newlines inside double quotes (single command — pass an actual line break inside the string):**

```bash
backlog task edit 42 --notes "First line
Second line

Final paragraph"
```

The same shape works for `--desc`, `--plan`, `--comment`, `--final-summary`, and the `--append-*` variants.

**3. Shell-specific shorthand (interactive shells only — some AI agent sandboxes reject these):**

- Bash/Zsh (ANSI‑C quoting):

  ```bash
  backlog task edit 42 --notes $'Line1\nLine2'
  ```

- POSIX sh (command substitution + printf):

  ```bash
  backlog task edit 42 --notes "$(printf 'Line1\nLine2')"
  ```

- PowerShell (backtick‑n):

  ```powershell
  backlog task edit 42 --notes "Line1`nLine2"
  ```

Prefer forms **1** and **2** when running under Claude Code, Codex, or any agent harness that screens commands through a tree‑sitter AST walker — those harnesses reject ANSI‑C strings, command substitutions, and heredoc forms (see issue [#595](https://github.com/MrLesk/Backlog.md/issues/595)).

Do not expect the literal sequence `\n` inside double quotes to become a newline. The CLI stores the backslash and `n` as written.

### Implementation Notes Formatting

- Keep implementation notes concise and time-ordered; focus on progress, decisions, and blockers.
- Use short paragraphs or bullet lists instead of a single long line.
- Use Markdown bullets (`-` for unordered, `1.` for ordered) for readability.
- When using CLI flags like `--append-notes`, remember to include explicit
  newlines. Either repeat the flag once per line:

  ```bash
  backlog task edit 42 --append-notes "- Added new API endpoint" \
    --append-notes "- Updated tests" \
    --append-notes "- TODO: monitor staging deploy"
  ```

  Or pass real newlines inside the quoted argument:

  ```bash
  backlog task edit 42 --append-notes "- Added new API endpoint
  - Updated tests
  - TODO: monitor staging deploy"
  ```

### Comments Formatting

- Use comments for task discussion, review notes, questions, and handoff context that should remain visible to humans and agents.
- Comments are append-only via `backlog task edit <id> --comment "..."`; include `--comment-author @name` when attribution is useful.
- Comment bodies may contain Markdown, but standalone `---` lines are reserved as comment delimiters.
- Do not use comments as the primary execution log; use Implementation Notes for progress and Final Summary for the PR description.

### Final Summary Formatting

- Treat the Final Summary as a PR description: lead with the outcome, then add key changes and tests.
- Keep it clean and structured so it can be pasted directly into GitHub.
- Prefer short paragraphs or bullet lists and avoid raw progress logs.
- Aim to cover: **what changed**, **why**, **user impact**, **tests run**, and **risks/follow‑ups** when relevant.
- Avoid single‑line summaries unless the change is truly tiny.

**Example (good, not rigid):**
```
Added Final Summary support across CLI/MCP/Web/TUI to separate PR summaries from progress notes.

Changes:
- Added `finalSummary` to task types and markdown section parsing/serialization (ordered after notes).
- CLI/MCP/Web/TUI now render and edit Final Summary; plain output includes it.

Tests:
- bun test src/test/final-summary.test.ts
- bun test src/test/cli-final-summary.test.ts
```

### Task Images (Local Assets)

Tasks may include images for screenshots, diagrams, or visual references. Local images are served automatically when using `backlog browser`.

**Storage location:**
- Place image files under the `assets/` folder inside your backlog directory (e.g., `backlog/assets/images/screenshot.png`)

**Supported formats:**
- png, jpg, jpeg, gif, svg, webp, avif (served with correct Content-Type)

**Markdown syntax in tasks:**
```markdown
![example](assets/images/screenshot.png)
```

**Workflow when adding images to tasks:**
1. Move or copy the image file into the `assets/` folder inside your backlog directory (e.g., `backlog/assets/images/screenshot.png`)
2. Then add or edit the task content via CLI, referencing the image using the `assets/<relative-path>` path

**Key points:**
- The path in Markdown starts with `assets/` and maps to the backlog directory's `assets/` folder; do **not** include the backlog directory name itself
- When `backlog browser` is running, these files are automatically available at `assets/<relative-path>`
- You can add images to descriptions, implementation notes, or final summaries using the standard CLI commands

### Document Management

> Docs are used for long-term project reference information, such as development standards, configuration guides, architecture documentation, etc. They differ from `tasks/` (specific tasks), `decisions/` (decision records), and `drafts/` (drafts).

Use Backlog.md public interfaces for document creation and updates so IDs, frontmatter, paths, and search metadata stay consistent.

#### CLI Usage

The CLI supports creating, updating, listing, and viewing documents.

```bash
# Create a new doc (saved under backlog/docs/ by default)
backlog doc create "API Guidelines"

# Create in a subdirectory (nested paths supported)
backlog doc create "Setup Guide" -p guides/setup

# Specify type at creation time
backlog doc create "Architecture" -t guide

# Update content while preserving omitted metadata
backlog doc update doc-1 --content "Updated markdown"

# Update metadata or move a doc within backlog/docs/
backlog doc update doc-1 --title "Setup Handbook" -t guide --tags setup,runbook -p guides

# List all docs (searched globally across subdirectories)
backlog doc list

# View a specific doc
backlog doc view doc-1
```

#### MCP / API Usage

- Use `document_create` to create documents with title, content, optional type/tags, and optional docs-directory-relative path.
- Use `document_update` to update document content, title, type, tags, or path while preserving document metadata.
- Document responses include the persisted docs-relative file path so agents can reference the created file without scanning source internals.

#### Key Rules

- Document paths are relative to `backlog/docs/`; absolute paths and `..` traversal are rejected.
- Supported document types are `readme`, `guide`, `specification`, and `other`.
- Document IDs are global across the entire docs tree, including nested subfolders.
- Prefer CLI, MCP, or Web document APIs over ad-hoc file writes so frontmatter and metadata remain valid.

### Task Operations

| Action             | Command                                      |
|--------------------|----------------------------------------------|
| View task          | `backlog task 42 --plain`                    |
| List tasks         | `backlog task list --plain`                  |
| Search tasks       | `backlog search "topic" --plain`              |
| Search with filter | `backlog search "api" --status "To Do" --plain` |
| Search by modified file | `backlog search --modified-file src/api.ts --plain` |
| Filter by status   | `backlog task list -s "In Progress" --plain` |
| Filter by assignee | `backlog task list -a @sara --plain`         |
| Archive task       | `backlog task archive 42`                    |
| Demote to draft    | `backlog task demote 42`                     |

---

## Common Issues

| Problem              | Solution                                                           |
|----------------------|--------------------------------------------------------------------|
| Task not found       | Check task ID with `backlog task list --plain`                     |
| AC won't check       | Use correct index: `backlog task 42 --plain` to see AC numbers     |
| Changes not saving   | Ensure you're using CLI, not editing files                         |
| Metadata out of sync | Re-edit via CLI to fix: `backlog task edit 42 -s <current-status>` |

---

## Remember: The Golden Rule

**🎯 If you want to change ANYTHING in a task, use the `backlog task edit` command.**
**📖 Use CLI to read tasks, exceptionally READ task files directly, never WRITE to them.**

Full help available: `backlog --help`

<!-- BACKLOG.MD GUIDELINES END -->
