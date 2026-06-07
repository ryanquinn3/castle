# Sand-Layer Sprite Edge Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy sprite-edge sand-layer renderer and make the gradient-based wet overlay the only `SandLayer` path.

**Architecture:** `SandLayer` should only maintain the binary moist/cleared state, the moist tilemap, and the overlay stamp renderer. Remove the `renderMode` option and all sprite-edge branching, then collapse tests so they verify the single supported rendering behavior.

**Tech Stack:** TypeScript, Excalibur `TileMap`/`Actor`/`Canvas`, Vitest.

---

### Task 1: Remove render-mode test scaffolding

**Files:**
- Modify: `src/view/sand-layer.test.ts`

- [ ] **Step 1: Write the failing test cleanup**

Replace render-mode-specific setup with one default helper and keep only wet-overlay behavior tests.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `node --run test:unit -- sand-layer`
Expected: FAIL because `SandLayer` still exports/accepts `renderMode` and old test setup no longer matches.

- [ ] **Step 3: Commit the red test change**

```bash
git add src/view/sand-layer.test.ts
git commit -m "test: remove sand layer sprite edge coverage"
```

### Task 2: Remove sprite-edge production code

**Files:**
- Modify: `src/view/sand-layer.ts`

- [ ] **Step 1: Delete render-mode plumbing**

Remove `SandLayerRenderMode`, `SandLayerOptions`, the `renderMode` field, and constructor branching.

- [ ] **Step 2: Delete sprite-edge rendering helpers**

Remove `N_EDGES`, `W_EDGES`, `E_EDGES`, `NW_OUTER`, `NE_OUTER`, `spriteFor()`, `variant()`, and `isClearedAt()`.

- [ ] **Step 3: Make tile repaint always use moist/plain logic**

`repaintCell()` should only clear graphics for cleared cells and otherwise add the `MOIST` sprite.

- [ ] **Step 4: Keep overlay path always on**

Always build/add the shared overlay actor and keep the current boundary-stamp logic intact.

- [ ] **Step 5: Run focused tests to verify pass**

Run: `node --run test:unit -- sand-layer`
Expected: PASS.

- [ ] **Step 6: Commit the cleanup**

```bash
git add src/view/sand-layer.ts src/view/sand-layer.test.ts
git commit -m "refactor: remove sand layer sprite edge mode"
```

### Task 3: Update docs and verify

**Files:**
- Modify: `docs/plans/2026-06-07-sand-layer-gradient-overlay.md`
- Modify: `docs/plans/2026-06-07-sand-layer-gradient-overlay-implementation.md`

- [ ] **Step 1: Remove stale sprite-edge references from docs**

Update design/plan docs so they describe only the current gradient-based implementation.

- [ ] **Step 2: Run full verification**

Run:

```bash
node --run test:unit
node --run lint
node --run build
```

Expected: all pass.

- [ ] **Step 3: Commit doc cleanup**

```bash
git add docs/plans/2026-06-07-sand-layer-gradient-overlay.md docs/plans/2026-06-07-sand-layer-gradient-overlay-implementation.md
git commit -m "docs: remove sand layer sprite edge notes"
```
