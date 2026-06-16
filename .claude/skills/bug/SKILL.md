---
name: bug
disable-model-invocation: true
argument-hint: "Reported bug details and reproduction steps"
description: Use when receiving a bug report, unexpected behavior, or gameplay issue from a player or tester
---

# Bug Investigation

Triage game bugs by collecting context, reproducing the failure, finding root cause, and proposing a focused fix.

## Core Rule

Reproduce and understand before fixing. Use `docs/agent-workflow.md` for artifact location and workflow preferences.

## Workflow

1. Intake: collect report details and game context.
2. Reproduce: use steps, tests, browser interaction, or debug JSON.
3. Investigate: trace the first boundary where behavior diverges.
4. Summarize: report reproduction, root cause, affected files, and proposed fix.
5. Plan: write a bug plan only when the fix is non-trivial or user asks.

## Intake

Ask for missing information only when you cannot infer or reproduce it yourself.

| Field | Why |
| --- | --- |
| Game mode | Classic and Tide have different session loops and wave params |
| Phase | Planning and wave bugs touch different systems |
| Level / wave number | Difficulty and budget depend on progression |
| Expected vs actual | Defines the failure precisely |
| Steps to reproduce | Fastest route to a failing case |
| Debug JSON | Press `D` in-game to copy board state |

If debug JSON is available, use it early. It captures castle position, terrain cells, puddle depths, wall hp, and last wave column heights.

## Reproduction Pointers

- Do not start a dev server; one is normally already running.
- Use browser tests for actor/rendering behavior that requires Excalibur or DOM APIs.
- Use unit tests for pure model, mode, and wave logic.
- The old pure Node replay script is retired because terrain actors require a browser context.

## Investigation Pointers

Work backward from the symptom:

- Session orchestration: `src/level-session.ts`, `src/tide-session.ts`
- Mode state: `src/modes/level-mode.ts`, `src/modes/tide-mode.ts`
- Planning input: `src/view/planning-phase.ts`, `src/view/terrain-editor.ts`, `src/view/toolbar.ts`
- Terrain state: `src/model/grid-model.ts`, `src/model/terrain/`
- Inventory: `src/model/inventory-model.ts`
- Wave runtime: `src/wave/wave-field-runtime.ts`, `src/wave/wave-dynamic-system.ts`
- Wave events: `src/wave/wave-event-applier.ts`, `src/wave/wave-terrain-feedback.ts`, `src/wave/wave-erosion.ts`
- HUD and overlays: `src/view/hud.ts`, `src/view/tide-hud.ts`, `src/view/screen-overlays.ts`, `src/ui/`

Check recent changes with `git diff` and relevant history for affected files.

## Common Categories

| Category | First places to check |
| --- | --- |
| Planning action invalid or mispriced | `terrain-editor.ts`, `grid-model.ts`, `inventory-model.ts`, `toolbar.ts` |
| Wave path or flooding seems wrong | `wave-field-runtime.ts`, `wave-dynamic-system.ts`, `wave-terrain-feedback.ts` |
| Wall or tower erosion wrong | `wave-erosion.ts`, `wave-event-applier.ts`, terrain classes |
| Hole pooling or silt wrong | `wave-terrain-feedback.ts`, `wave-event-applier.ts`, `hole.ts` |
| Level or tide progression wrong | `level-mode.ts`, `tide-mode.ts`, sessions |
| Visual tile mismatch | terrain classes, `syncGraphic()`, view overlays |
| HUD or toolbar mismatch | `hud.ts`, `tide-hud.ts`, `toolbar.ts`, `src/ui/` |

## Bug Writeup

For substantial bugs, write `docs/bugs/YYYY-MM-DD-<slug>.md` unless Backlog.md is active for the task.

Use this shape:

```markdown
# <Bug title>

## Problem

## Reproduction

## Root Cause

## Solution

## Files To Change

## Verification
```

## Verification

- Run the narrowest relevant test first.
- Run `node --run static-check` before claiming a code fix is complete unless blocked or explicitly skipped.
- For gameplay changes, update `docs/gameplay.md` when behavior changes.
