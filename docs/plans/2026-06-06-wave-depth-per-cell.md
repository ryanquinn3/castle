# Wave Depth Per Cell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make moving and static water visuals derive alpha from the actual water depth carried cell-to-cell by the wave.

**Architecture:** Keep the current actor/runtime structure. Change `WaveSegment` so each row transition preserves the settled depth of the previous cell for static water, while the moving segment continues forward with the reduced depth for the next cell. Remove row-based static opacity logic and return static water alpha to depth-only mapping.

**Tech Stack:** TypeScript, Excalibur.js, Vite

---

### Task 1: Propagate settled depth per cell

**Files:**
- Modify: `src/wave/wave-segment.ts`
- Modify: `src/wave/static-water-actor.ts`
- Modify: `src/wave/water-alpha.ts`

- [ ] Capture the fixed depth left behind for the previous cell inside `WaveSegment.enterRow()`.
- [ ] Emit `tileCovered` using that fixed previous-cell depth after terrain/slope mutation determines the next moving depth.
- [ ] Remove row-based static alpha logic.
- [ ] Render static water with `depthAlpha(depth)` only.

### Task 2: Keep runtime wiring minimal

**Files:**
- Modify: `src/wave/wave-actor-runtime.ts`

- [ ] Remove now-unused static-water row/slope opacity plumbing if no longer needed.
- [ ] Keep runtime behavior otherwise unchanged.

### Task 3: Verify without tests

**Files:**
- Modify: none

- [ ] Run a TypeScript/build-style verification command if available.
- [ ] Inspect changed files for consistency and dead code.
