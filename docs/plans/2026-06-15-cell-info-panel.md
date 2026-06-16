# Cell Info Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
>
> **Execution policy (from `docs/plans/CLAUDE.md`):** Use sub-agent driven execution with **sonnet** as the subagent model. Make a commit after each task. This repo does **not** use git worktrees — work on the current branch.

**Goal:** Show information about the selected cell (type, height, wall HP, hole water, tower wear) in the top-right HUD panel during planning, in both Classic and Tide modes.

**Architecture:** Each terrain gains a `describe(): CellInfo` method returning an open `{ title, stats[] }` shape, so every cell owns its own presentation. `TerrainEditor.getSelectedInfo()` returns the selected cell's `CellInfo` (or `null`). The shared `PlanningHud` interface carries it via `updateSelection()`; both `Hud`/`TideHud` render it through a shared `CellInfoPanel.tsx`. This replaces the old action-verb hint and transient status strings.

**Tech Stack:** TypeScript, Excalibur.js, React (HUD overlays), Vitest (jsdom unit project + browser project).

**Design doc:** `docs/plans/2026-06-15-cell-info-panel-design.md`

**Conventions to follow:**
- @docs/plans/CLAUDE.md (subagent + sonnet + commit per task)
- Testing rules: read 1-2 existing tests first; partial matching over deep-equals; no stubbing the subject under test; check whether a package uses Vitest or Mocha (this repo: Vitest). Existing terrain tests live beside source (`*.test.ts`).
- Code style: curly braces on all `if`s, return early, inline object fields, co-locate types with their module.
- Verification: `node --run static-check` (lint + typecheck + tests) must pass before any task is considered done.

---

## Task 1: `CellInfo` data model + `describe()` on every terrain

The abstract method must be added together with all four implementations, or typecheck breaks. Do the whole task as one unit.

**Files:**
- Modify: `src/model/terrain/terrain.ts` (add types + abstract method)
- Modify: `src/model/terrain/utils.ts` (add `fmtNum` helper)
- Modify: `src/model/terrain/flat-ground.ts`, `hole.ts`, `wall.ts`, `tower.ts` (implement `describe()`)
- Test: `src/model/terrain/flat-ground.test.ts`, `hole.test.ts`, `wall.test.ts`, `tower.test.ts`

**Step 1: Write the failing tests**

Add to `flat-ground.test.ts`:

```ts
import { FlatGround } from './flat-ground.ts';
// ...existing imports...

describe('FlatGround.describe', () => {
  test('reports flat ground at height 0', () => {
    expect(new FlatGround().describe()).toEqual({
      title: 'Flat ground',
      stats: [{ label: 'Height', value: '0' }],
    });
  });
});
```

Add to `hole.test.ts`:

```ts
describe('Hole.describe', () => {
  test('reports depth and water as fractions', () => {
    const h = new Hole(2);
    h.addPuddle(1.5);
    expect(h.describe()).toEqual({
      title: 'Hole',
      stats: [
        { label: 'Depth', value: '2' },
        { label: 'Water', value: '1.5 / 2' },
      ],
    });
  });
});
```

Add to `wall.test.ts` (uses `WALL_LEVEL_HP`, already imported there):

```ts
describe('Wall.describe', () => {
  test('reports level, current/max HP, and blocking height', () => {
    const w = new Wall(2); // hp 45, elevation 10
    w.applyHits(13);       // hp 32
    expect(w.describe()).toEqual({
      title: 'Wall L2',
      stats: [
        { label: 'HP', value: `32 / ${WALL_LEVEL_HP[1]}` },
        { label: 'Height', value: '10' },
      ],
    });
  });
});
```

Add to `tower.test.ts` (import `TOWER_HITS_PER_EROSION` from `../../config.ts`):

```ts
describe('Tower.describe', () => {
  test('reports height and erosion wear', () => {
    const t = new Tower(15);
    t.applyHits(4); // 4 hits, below the 10 threshold so height unchanged
    expect(t.describe()).toEqual({
      title: 'Tower',
      stats: [
        { label: 'Height', value: '15' },
        { label: 'Wear', value: `4 / ${TOWER_HITS_PER_EROSION}` },
      ],
    });
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `node --run test:unit`
Expected: FAIL — `describe is not a function` / type errors on missing `describe()`.

**Step 3: Add the types and abstract method to `terrain.ts`**

Near the other exported interfaces (e.g. after `TileRenderInfo`):

```ts
export interface CellStat {
  label: string;
  value: string;
}

export interface CellInfo {
  title: string;
  stats: CellStat[];
}
```

Add to the abstract method list at the bottom of `abstract class Terrain`:

```ts
  abstract describe(): CellInfo;
```

**Step 4: Add `fmtNum` to `utils.ts`**

```ts
// Whole numbers render plain; fractional values round to one decimal.
export function fmtNum(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
```

**Step 5: Implement `describe()` in each terrain**

`flat-ground.ts` — add `CellInfo` to the type import from `./terrain.ts`:

```ts
  describe(): CellInfo {
    return { title: 'Flat ground', stats: [{ label: 'Height', value: '0' }] };
  }
```

`hole.ts` — import `CellInfo` from `./terrain.ts` and `fmtNum` from `./utils.ts` (the file already imports `clamp, elevationToColor` from `./utils.ts`):

```ts
  describe(): CellInfo {
    return {
      title: 'Hole',
      stats: [
        { label: 'Depth', value: fmtNum(this.depth) },
        { label: 'Water', value: `${fmtNum(this.puddleDepth)} / ${fmtNum(this.depth)}` },
      ],
    };
  }
```

`wall.ts` — import `CellInfo` from `./terrain.ts` and `fmtNum` from `./utils.ts` (the file already imports `elevationToColor` from `./utils.ts`; `WALL_LEVEL_HP` is already imported from config):

```ts
  describe(): CellInfo {
    return {
      title: `Wall L${this.level}`,
      stats: [
        { label: 'HP', value: `${fmtNum(this.hp)} / ${WALL_LEVEL_HP[this.level - 1]}` },
        { label: 'Height', value: fmtNum(this.elevation) },
      ],
    };
  }
```

`tower.ts` — import `CellInfo` from `./terrain.ts` and `fmtNum` from `./utils.ts` (new import); `TOWER_HITS_PER_EROSION` is already imported from config:

```ts
  describe(): CellInfo {
    return {
      title: 'Tower',
      stats: [
        { label: 'Height', value: fmtNum(this.towerHeight) },
        { label: 'Wear', value: `${this.hitCount} / ${TOWER_HITS_PER_EROSION}` },
      ],
    };
  }
```

**Step 6: Run the tests to verify they pass**

Run: `node --run test:unit`
Expected: PASS (new `describe` suites green; nothing else broken).

**Step 7: Full verification**

Run: `node --run static-check`
Expected: PASS.

**Step 8: Commit**

```bash
git add src/model/terrain/
git commit -m "feat: add describe() cell-info to terrain types"
```

---

## Task 2: Shared `CellInfoPanel` React component

Standalone component + CSS. It is not wired in yet (that's Task 3); an unused export does not break the build.

**Files:**
- Create: `src/ui/CellInfoPanel.tsx`
- Modify: `src/ui/hud.css`

**Step 1: Create `src/ui/CellInfoPanel.tsx`**

```tsx
import type { FC } from 'react';
import type { CellInfo } from '../model/terrain/terrain.ts';
import './hud.css';

interface CellInfoPanelProps {
  info: CellInfo | null;
}

const CellInfoPanel: FC<CellInfoPanelProps> = ({ info }) => {
  if (!info) {
    return <div className="hud-panel__state hud-panel__state--dim">Select a cell</div>;
  }
  return (
    <div className="cell-info">
      <div className="cell-info__title">{info.title}</div>
      {info.stats.map((stat) => (
        <div className="cell-info__stat" key={stat.label}>
          <span className="cell-info__stat-label">{stat.label}</span>
          <span className="cell-info__stat-value">{stat.value}</span>
        </div>
      ))}
    </div>
  );
};

export default CellInfoPanel;
```

**Step 2: Add styles to `src/ui/hud.css`**

```css
.cell-info__title {
  color: white;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.cell-info__stat {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  line-height: 1.4;
}

.cell-info__stat-label {
  color: rgba(255, 255, 255, 0.7);
}

.cell-info__stat-value {
  color: white;
  font-weight: 600;
}
```

**Step 3: Verify**

Run: `node --run static-check`
Expected: PASS (component compiles; no behavior change yet).

**Step 4: Commit**

```bash
git add src/ui/CellInfoPanel.tsx src/ui/hud.css
git commit -m "feat: add CellInfoPanel component"
```

---

## Task 3: Wire selection info through editor, HUD interface, and both modes

This is the cascade: changing the `PlanningHud` interface forces matching changes in `TerrainEditor`, `PlanningPhase`, `Hud`, `TideHud`, and both React components. They must change together to compile.

**Files:**
- Modify: `src/view/terrain-editor.ts` (replace `getStateText` with `getSelectedInfo`)
- Modify: `src/view/terrain-editor.test.ts` (replace `getStateText` tests)
- Modify: `src/view/planning-phase.ts` (interface + call sites)
- Modify: `src/view/hud.ts` + `src/ui/HudComponent.tsx`
- Modify: `src/view/tide-hud.ts` + `src/ui/TideHudComponent.tsx`

**Step 1: Rewrite the editor's selection tests (TDD first)**

In `terrain-editor.test.ts`, replace the four `getStateText` fixture tests (currently around lines 354–373) and the assertion at line 234. New tests:

```ts
fixtureIt('getSelectedInfo is null when nothing is selected', ({ editor }) => {
  expect(editor.getSelectedInfo()).toBeNull();
});

fixtureIt('getSelectedInfo returns the selected cell description', ({ scene, editor }) => {
  // makeGridStub().getCell returns a FlatGround by default
  scene.pointerHandlers.down(pointerEvt(2, 2));
  expect(editor.getSelectedInfo()).toEqual({
    title: 'Flat ground',
    stats: [{ label: 'Height', value: '0' }],
  });
});

fixtureIt('getSelectedInfo reflects the cell type under selection', ({ scene, grid, editor }) => {
  grid.getCell = vi.fn<() => Terrain>(() => new Tower(15));
  scene.pointerHandlers.down(pointerEvt(2, 2));
  expect(editor.getSelectedInfo()?.title).toBe('Tower');
});
```

At line ~234, the assertion `expect(editor.getStateText()).toBe('Selected - dig')` sits in a test about toolbar enablement. Remove just that one `getStateText` line (the `toolbar.setEnabledTools` assertion above it stays and still covers the case).

**Step 2: Run tests to verify they fail**

Run: `node --run test:unit`
Expected: FAIL — `getSelectedInfo` does not exist.

**Step 3: Replace `getStateText` in `terrain-editor.ts`**

Update the type import:

```ts
import type { Terrain, CellInfo } from '../model/terrain/terrain.ts';
```

Delete the entire `getStateText(): string { ... }` method (currently ~lines 417–440) and replace with:

```ts
getSelectedInfo(): CellInfo | null {
  if (!this.selected || !this.grid) {
    return null;
  }
  return this.grid.getCell(this.selected.col, this.selected.row).describe();
}
```

(`availableActionsFor` stays — `updateToolbar` still uses it. `ToolType`/`WALL_TOOL_FOR_LEVEL` imports stay — `validActionsFor`/`applyAction` still use them.)

**Step 4: Update `planning-phase.ts`**

Add import:

```ts
import type { CellInfo } from '../model/terrain/terrain.ts';
```

In the `PlanningHud` interface, replace `updateState(text: string): void;` with:

```ts
updateSelection(info: CellInfo | null): void;
```

In `activate`, the `onStateChanged` callback and the line after `setSandCount`:

```ts
onStateChanged: () => this.hud.updateSelection(this.editor.getSelectedInfo()),
```
and replace `this.hud.updateState(this.editor.getStateText());` with
```ts
this.hud.updateSelection(this.editor.getSelectedInfo());
```

In `handleEdit`, replace `this.hud.updateState(this.editor.getStateText());` with
```ts
this.hud.updateSelection(this.editor.getSelectedInfo());
```
and **delete** the `this.hud.updateState('Sending wave...');` line (pure cell info; no transient text).

**Step 5: Update Classic `hud.ts`**

- Add `import type { CellInfo } from '../model/terrain/terrain.ts';`
- Change the `planning` field type to `{ waveText: string } | null` (drop `stateText`) and add `private selection: CellInfo | null = null;`
- `showPlanning`: `this.planning = { waveText };`
- Remove `updateState`; add:
```ts
updateSelection(info: CellInfo | null): void {
  this.selection = info;
  this.render();
}
```
- `hidePlanning`: set both `this.planning = null;` and `this.selection = null;`
- `activate`: reset `this.selection = null;`
- `render`: pass `planning: this.planning` and `selection: this.selection` to `HudComponent`.

**Step 6: Update `HudComponent.tsx`**

- Import `CellInfoPanel` and `type { CellInfo }`.
- `HudProps.planning` becomes `{ waveText: string } | null`; add `selection: CellInfo | null`.
- Left panel: keep `{planning && <div className="hud-panel__wave">{planning.waveText}</div>}`.
- Right panel:
```tsx
<div className="hud-panel hud-panel--right" style={rightStyle}>
  {planning ? (
    <CellInfoPanel info={selection} />
  ) : (
    <div className="hud-panel__state hud-panel__state--dim">Waiting...</div>
  )}
</div>
```

**Step 7: Update `tide-hud.ts`**

- Add `import type { CellInfo } from '../model/terrain/terrain.ts';`
- Replace `private stateText = '';` with `private selection: CellInfo | null = null;`
- Remove `updateState`; add `updateSelection(info: CellInfo | null)` setting `this.selection` and calling `render()`.
- `render`: pass `selection: this.selection` to `TideHudComponent` (drop `stateText`).

**Step 8: Update `TideHudComponent.tsx`**

- Import `CellInfoPanel` and `type { CellInfo }`.
- Replace the `stateText: string` prop with `selection: CellInfo | null`.
- Right panel keeps the countdown line and renders the panel beneath it:
```tsx
<div className="hud-panel hud-panel--right" style={rightStyle}>
  <div className="hud-panel__wave">Next wave: {countdown}s</div>
  <CellInfoPanel info={selection} />
</div>
```

**Step 9: Run unit tests**

Run: `node --run test:unit`
Expected: PASS (editor tests green; no remaining `getStateText`/`updateState` references).

**Step 10: Full verification**

Run: `node --run static-check`
Expected: PASS.

**Step 11: Commit**

```bash
git add src/view/ src/ui/
git commit -m "feat: show selected cell info in HUD for both modes"
```

---

## Task 4: Docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/gameplay.md`

**Step 1: Update `AGENTS.md`**

In the View layer core-files list, add a bullet for `CellInfoPanel.tsx` and note that the right HUD panel now shows selected-cell stats. Update the `HudComponent`/`TideHudComponent` descriptions in the UI layer section if they mention the old state text.

**Step 2: Update `docs/gameplay.md`**

Under the planning-phase description, add a sentence: selecting a cell shows its stats in the top-right panel (type and height; wall level + HP; hole depth + water; tower height + erosion wear).

**Step 3: Verify**

Run: `node --run static-check`
Expected: PASS (docs-only, but confirm nothing else regressed).

**Step 4: Commit**

```bash
git add AGENTS.md docs/gameplay.md
git commit -m "docs: document cell info panel"
```

---

## Done criteria

- Selecting a cell during planning shows its info in the top-right panel in both Classic and Tide.
- The old action-verb hint and transient status strings are gone.
- Each terrain owns its own `describe()` output; the view assumes no fixed field set.
- `node --run static-check` passes.
```
