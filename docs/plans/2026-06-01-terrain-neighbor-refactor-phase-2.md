# Terrain Neighbor Refactor (Phase 2) — Contiguous Wall Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render walls as a contiguous mass — runs, corners, T-junctions, and crosses read as one solid structure with a defined perimeter — by replacing the per-tile wall spritesheet with procedural `customDraw` rendering driven by `Terrain.neighbors` / `Terrain.connectsTo`.

**Architecture:** Per-tile cached canvas (the same pattern `Hole.getRenderInfo()` already uses). `Wall.getRenderInfo()` returns a `customDraw` closure that reads `this.neighbors`, treats an edge as *connected* when `this.connectsTo(neighbor)` is true, and fills the whole tile with a tier texture pattern (anchored to the grid origin so the texture is continuous across connected tiles). Exposed edges get an outline, a north/south bevel, rounded outer corners, and a south shadow sliver. A `cacheKey` keyed by tier + connectivity mask + grid position drives the existing `graphicsCache`.

**Tech Stack:** TypeScript, Excalibur.js, Vite, Vitest (unit), Playwright (visual regression).

**Source design doc:** `docs/plans/2026-06-01-terrain-neighbor-refactor-and-wall-rendering.md` (locked visual params live there). **Phase 1 plan:** `docs/plans/2026-06-01-terrain-neighbor-refactor-phase-1.md`.

---

## Pre-flight

**Decisions locked for this plan (confirmed with the user):**
- **Finish Phase 1 first** (Part A below) so this plan is self-contained and safe to execute now. Phase 1 Tasks 1–3 are already committed (`abfd2b3`, `3897637`, `94f49c6`); Tasks 4–6 are **not** done and are carried over here as Tasks A1–A3.
- **Per-tile cached canvas** for wall rendering (not a grid-level overlay).

**Locked visual parameters (from `.tmp/wall-mass-proto.html`, single light source from the north):**
- `bevelStrength: 0.58`, `bevelWidthPx: 3`
- `cornerRadiusPx: 10` (rounded only on outer convex corners — both adjacent edges exposed)
- `dropShadow: 0.24` — folded into the south bevel sliver (per-tile canvas cannot spill onto the sand tile below; this is the intentional approximation chosen with the per-tile architecture)
- `outlineDarkness: 0.34` (all exposed edges)
- crenellations: off
- Tier textures: `public/images/wall-level-1..4.png`, sampled into a 64×64 repeat swatch with the prototype's crop (`sx=0.18w, sw=0.64w, sy=0.42h, sh=0.5h`)

**Verified API facts (via LSP):**
- `ImageSource.image: HTMLImageElement` and `ImageSource.isLoaded(): boolean` exist — use `.image` as the `createPattern` source, guarded by `isLoaded()`.
- `Terrain.sprite` getter is referenced only inside `terrain.ts` (declarations/overrides) and `terrain.test.ts` — **not** by the view (rendering goes through `getRenderInfo()`). Safe to repoint `Wall.sprite` at the tier textures.
- `Resources.WallSpritesheet` is referenced only by `resources.ts` (def + loader) and `terrain.ts` (`getWallSpriteSheet`, `Wall.sprite`). Removing it touches only those sites.
- `PoolNeighbors` is defined **twice**: `grid-model.ts:34` (kept — used by `getPoolNeighbors`, digging hover previews) and `tile.ts:14` (a duplicate, deleted in Task A2). No cross-layer import to untangle.

**Conventions to follow:**
- `grid-model.test.ts` / `terrain.test.ts`: see existing files. `grid-model.test.ts` uses `baseTest.extend<{ grid: GridModel }>(...)` fixtures (reuse the `grid` fixture); `terrain.test.ts` uses plain `test(...)` inside `describe` blocks per class.
- Curly braces on all `if`s; `for..of`/iterators over index loops where natural; canonical errors; object args for 3+ params; prefer flattened/early-return functions.
- Conventional commits (`feat:`, `refactor:`, `test:`, `docs:`).
- Run unit tests with `node --run test:unit` (NOT `npx vitest`).

**Customer-data / secrets note:** none of these files contain customer data, credentials, or production config. This is a local game repo.

---

# Part A — Finish Phase 1 (model + view plumbing)

> These are Tasks 4–6 of the Phase 1 plan, carried over verbatim so this plan stands alone. **Behavior-preservation invariant:** adjacent holes are always in the same pool, so `neighbor instanceof Hole` equals today's `getPoolNeighbors` flag, and out-of-bounds → `null instanceof Hole === false`. Therefore **Playwright baselines MUST stay unchanged through the end of Part A.**

## Task A1: Derive hole render flags from `this.neighbors`; add `cacheKey`; drop vestigial field

**Files:**
- Modify: `src/model/terrain.ts` (`TileRenderInfo`, `Hole`, delete `PoolNeighborFlags`)
- Modify: `src/model/grid-model.ts` (`detectPools` write block)
- Test: `src/model/grid-model.test.ts`

**Step 1: Write the failing test**

In `src/model/grid-model.test.ts`, **replace** the entire `describe('pool neighbor flags on Hole', ...)` block (the block whose assertions reference `hole33.poolNeighborFlags` / `hole.poolNeighborFlags`, ~lines 470–490) with:

```ts
describe('hole neighbor awareness', () => {
  test('a hole sees adjacent holes via this.neighbors', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    grid.setElevation(4, 3, -1); // east
    grid.setElevation(3, 4, -1); // south

    const hole = grid.getCell(3, 3) as Hole;
    expect(hole.neighbors.south).toBeInstanceOf(Hole);
    expect(hole.neighbors.east).toBeInstanceOf(Hole);
    expect(hole.neighbors.north).not.toBeInstanceOf(Hole);
    expect(hole.neighbors.west).not.toBeInstanceOf(Hole);
  });

  test('hole getRenderInfo exposes a stable cacheKey reflecting neighbors', ({ grid }) => {
    grid.setElevation(3, 3, -1);
    const before = (grid.getCell(3, 3) as Hole).getRenderInfo().cacheKey;
    grid.setElevation(4, 3, -1); // add an east hole neighbor
    const after = (grid.getCell(3, 3) as Hole).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --run test:unit`
Expected: FAIL (`getRenderInfo().cacheKey` is undefined; the removed block referenced `poolNeighborFlags`).

**Step 3: Implement**

In `src/model/terrain.ts`:

1. Update `TileRenderInfo` — drop the `neighbors` param on `customDraw`, add `cacheKey`:

```ts
export interface TileRenderInfo {
  sprite: Sprite | null;
  tint: Color | null;
  cacheKey?: string;
  customDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}
```

2. Delete the `PoolNeighborFlags` interface (the `export interface PoolNeighborFlags {...}` block, ~lines 42–47).

3. In `Hole`, delete the field `poolNeighborFlags: PoolNeighborFlags = {...}` (~line 306).

4. Replace `Hole.getRenderInfo()` so it derives edge flags from `this.neighbors`, sets `cacheKey`, and the `customDraw` closure reads those flags (no param). The local names mirror the originals so the draw math is byte-identical to today's output:

```ts
getRenderInfo(): TileRenderInfo {
  const nb = this.neighbors;
  const nt = nb.north instanceof Hole;
  const nbm = nb.south instanceof Hole;
  const nl = nb.west instanceof Hole;
  const nr2 = nb.east instanceof Hole;
  const cacheKey = `hole:${this.elevation}:${this.puddleDepth}:${+nt}${+nbm}${+nl}${+nr2}`;
  return {
    sprite: null,
    tint: null,
    cacheKey,
    customDraw: (ctx, width, height) => {
      const elevation = this.elevation;
      const puddleDepth = this.puddleDepth;
      const color = elevationToColor(elevation);
      const r = color.r;
      const g = color.g;
      const b = color.b;
      const cornerRadius = Math.max(3, Math.floor(width * 0.2));

      const fillW = nr2 ? width : width - 1;
      const fillH = nbm ? height : height - 1;

      const tl = (!nt && !nl) ? cornerRadius : 0;
      const tr = (!nt && !nr2) ? cornerRadius : 0;
      const br = (!nbm && !nr2) ? cornerRadius : 0;
      const bl = (!nbm && !nl) ? cornerRadius : 0;
      ctx.beginPath();
      ctx.roundRect(0, 0, fillW, fillH, [tl, tr, br, bl]);
      ctx.save();
      ctx.clip();

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, fillW, fillH);

      const shadowR = clamp(r - 60, 0, 255);
      const shadowG = clamp(g - 60, 0, 255);
      const shadowB = clamp(b - 60, 0, 255);
      const diffuseR = clamp(r + 30, 0, 255);
      const diffuseG = clamp(g + 30, 0, 255);
      const diffuseB = clamp(b + 30, 0, 255);

      ctx.fillStyle = `rgb(${shadowR},${shadowG},${shadowB})`;
      if (!nt) { ctx.fillRect(0, 0, fillW, 2); }
      if (!nl) { ctx.fillRect(0, 0, 2, fillH); }

      ctx.fillStyle = `rgb(${diffuseR},${diffuseG},${diffuseB})`;
      if (!nbm) { ctx.fillRect(0, height - 2, fillW, 1); }
      if (!nr2) { ctx.fillRect(width - 2, 0, 1, fillH); }

      if (puddleDepth > 0 && elevation < 0) {
        const puddleAlpha = 0.25 + (puddleDepth / -elevation) * 0.45;
        ctx.fillStyle = `rgba(60, 130, 200, ${puddleAlpha})`;
        const px = nl ? 2 : 0;
        const py = nt ? 2 : 0;
        const pw = (nr2 ? width : width - 2) - px;
        const ph = (nbm ? height : height - 2) - py;
        ctx.fillRect(px, py, pw, ph);
      }

      ctx.restore();
    },
  };
}
```

In `src/model/grid-model.ts`:

5. In `detectPools()`, delete the trailing block that writes `cell.poolNeighborFlags` (the `for (const pool of this.pools)` loop at ~lines 350–362). Keep everything that builds `this.pools` and `this.poolMap`, and keep `getPoolNeighbors` (~line 377) untouched.

**Step 4: Run to verify it passes**

Run: `node --run test:unit`
Expected: PASS. (The existing `getPoolNeighbors` describe block stays green.)

**Step 5: Commit**

```bash
git add src/model/terrain.ts src/model/grid-model.ts src/model/grid-model.test.ts
git commit -m "refactor: derive Hole render flags from neighbors, drop vestigial field"
```

---

## Task A2: Decouple the view from neighbor computation

**Files:**
- Modify: `src/view/tile.ts`
- Modify: `src/view/grid-view.ts` (`refreshTileVisual`, ~lines 110–121)

**Step 1: Verify the current state compiles (baseline)**

Run: `node --run build`
Expected: PASS. (No new unit test — this wiring change is proved by visual regression in Task A3. `grid-view.test.ts` references none of `updateVisual`/`PoolNeighbors`/`cacheKey`.)

**Step 2: Implement**

In `src/view/tile.ts`:

- Delete the local `export interface PoolNeighbors {...}` block (~lines 14–19). (The canonical `PoolNeighbors` in `grid-model.ts` stays.)
- Change the signature `updateVisual(neighbors?: PoolNeighbors): void` → `updateVisual(): void`.
- Replace the `customDraw` branch to use `info.cacheKey` and call `customDraw` with no neighbor arg:

```ts
if (info.customDraw) {
  const cacheKey = info.cacheKey ?? `${this.elevation}:${this.puddleDepth}`;
  const cached = graphicsCache.get(cacheKey);
  if (cached) {
    this.graphics.use(cached);
    return;
  }
  const canvas = new Canvas({
    width: TILE_SIZE,
    height: TILE_SIZE,
    cache: true,
    draw: (ctx) => info.customDraw!(ctx, TILE_SIZE, TILE_SIZE),
  });
  graphicsCache.set(cacheKey, canvas);
  this.graphics.use(canvas);
  return;
}
```

In `src/view/grid-view.ts` `refreshTileVisual` — remove the `getPoolNeighbors` call and pass no args:

```ts
refreshTileVisual(col: number, row: number): void {
  const tile = this.getTile(col, row);
  if (!tile) {
    return;
  }
  tile.elevation = this.model.getElevation(col, row);
  tile.puddleDepth = this.model.getPuddleDepth(col, row);
  tile.waveHitCount = this.model.getHitCount(col, row);
  tile.terrain = this.model.getCell(col, row);
  tile.updateVisual();
}
```

**Step 3: Run to verify it compiles and unit tests pass**

Run: `node --run build && node --run test:unit`
Expected: PASS. (`single-cell-digging.ts`, `drag-digging.ts`, `drag-digging.test.ts` are untouched — they call `getPoolNeighbors` directly for previews.)

**Step 4: Commit**

```bash
git add src/view/tile.ts src/view/grid-view.ts
git commit -m "refactor: tiles render from terrain.neighbors via cacheKey, drop view neighbor plumbing"
```

---

## Task A3: Phase 1 full verification (visual regression = behavior proof)

**Files:** none (verification only).

**Step 1: Static checks**

Run: `node --run lint && node --run build && node --run test:unit`
Expected: all PASS.

**Step 2: Visual regression — baselines must NOT change**

Run: `node --run test:integration` (Playwright; see `AGENTS.md` Testing section)
Expected: PASS with **no** screenshot diffs. Do **not** update baselines here.

If a diff appears, STOP and use superpowers:systematic-debugging — a diff means a flag-derivation or attachment bug, not an intended change. Phase 1 is behavior-preserving by construction.

**Step 3:** No commit expected (verification only). Phase 1 is complete; Part B begins.

---

# Part B — Contiguous wall rendering

## Task B1: Register per-tier wall textures

**Files:**
- Modify: `src/resources.ts`

**Step 1: Implement**

Add the four tier textures to `Resources` and to the `loader` array (the PNGs already exist in `public/images/`):

```ts
export const Resources = {
  Castle: new ImageSource('./images/castle.png'),
  WallSpritesheet: new ImageSource('./images/wall-spritesheet.png'),
  WallLevel1: new ImageSource('./images/wall-level-1.png'),
  WallLevel2: new ImageSource('./images/wall-level-2.png'),
  WallLevel3: new ImageSource('./images/wall-level-3.png'),
  WallLevel4: new ImageSource('./images/wall-level-4.png'),
  Shovel: new ImageSource('./images/shovel-sprite.png'),
  WallTool: new ImageSource('./images/wall-tool-sprite.png'),
  TowerSprite: new ImageSource('./images/tower-sprite.png'),
  DigSound: new Sound('./sound/dig_sound.mp3'),
  WallToolSound: new Sound('./sound/wall_tool_sound.mp3'),
  WaveSound: new Sound('./sound/wave_sound.mp3'),
} as const;
```

Add `Resources.WallLevel1`, `WallLevel2`, `WallLevel3`, `WallLevel4` to the `new Loader([...])` array (keep `WallSpritesheet` for now — Task B3 removes it).

**Step 2: Verify it compiles**

Run: `node --run build`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/resources.ts
git commit -m "feat: register per-tier wall textures (wall-level-1..4)"
```

---

## Task B2: Procedural contiguous `Wall.getRenderInfo()`

**Files:**
- Modify: `src/model/terrain.ts` (`Wall`, plus a module-level pattern helper)
- Test: `src/model/terrain.test.ts`

**Step 1: Write the failing test**

In `src/model/terrain.test.ts`, inside the existing `describe('Wall', ...)` block, **replace** the two `sprite returns WallLevel...` tests with the assertions below and add a new `getRenderInfo` describe. `Wall.getRenderInfo()` must not touch the DOM (the pattern is only built inside `customDraw`, which unit tests never invoke), so these run cleanly under Vitest/jsdom.

Replace the existing sprite tests:

```ts
  test('sprite returns the tier-1 texture for height 1-5', () => {
    expect(new Wall(3).sprite).toBe(Resources.WallLevel1);
  });

  test('sprite returns the tier-4 texture for height 16-20', () => {
    expect(new Wall(18).sprite).toBe(Resources.WallLevel4);
  });
```

Add (ensure `Resources` is imported in the test file — it is needed by the assertions above):

```ts
describe('Wall.getRenderInfo (contiguous mass)', () => {
  test('returns a customDraw and no sprite-only render', () => {
    const info = new Wall(3).getRenderInfo();
    expect(info.customDraw).toBeTypeOf('function');
    expect(info.cacheKey).toContain('wall:');
  });

  test('cacheKey changes when a connecting neighbor appears', () => {
    const grid = new GridModel();
    grid.setElevation(5, 5, 3); // wall
    const before = (grid.getCell(5, 5) as Wall).getRenderInfo().cacheKey;
    grid.setElevation(6, 5, 3); // connecting wall to the east
    const after = (grid.getCell(5, 5) as Wall).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });

  test('cacheKey changes across tiers', () => {
    const a = new Wall(3).getRenderInfo().cacheKey; // tier 0
    const b = new Wall(18).getRenderInfo().cacheKey; // tier 3
    expect(a).not.toEqual(b);
  });
});
```

> If `terrain.test.ts` does not already import `GridModel`, add `import { GridModel } from './grid-model.ts';`. Confirm the import path matches the other test files.

**Step 2: Run to verify it fails**

Run: `node --run test:unit`
Expected: FAIL (`info.customDraw` is undefined; `sprite` returns the spritesheet, not `WallLevel1`).

**Step 3: Implement**

In `src/model/terrain.ts`, add a module-level pattern helper near `getWallSpriteSheet` (the swatch crop replicates `.tmp/wall-mass-proto.html`):

```ts
const WALL_TEXTURE_SWATCH = 64;
const wallPatterns: (CanvasPattern | null)[] = [null, null, null, null];

function wallTextureFor(tierIndex: number): ImageSource {
  return [
    Resources.WallLevel1,
    Resources.WallLevel2,
    Resources.WallLevel3,
    Resources.WallLevel4,
  ][tierIndex];
}

// Builds (and caches) a 64x64 repeat pattern from the tier texture. Returns
// null until the image has loaded; callers fall back to a flat tier color.
function getWallPattern(ctx: CanvasRenderingContext2D, tierIndex: number): CanvasPattern | null {
  const existing = wallPatterns[tierIndex];
  if (existing) {
    return existing;
  }
  const source = wallTextureFor(tierIndex);
  if (!source.isLoaded()) {
    return null;
  }
  const img = source.image;
  const swatch = document.createElement('canvas');
  swatch.width = WALL_TEXTURE_SWATCH;
  swatch.height = WALL_TEXTURE_SWATCH;
  const sctx = swatch.getContext('2d');
  if (!sctx) {
    return null;
  }
  sctx.imageSmoothingEnabled = false;
  const sx = Math.floor(img.width * 0.18);
  const sw = Math.floor(img.width * 0.64);
  const sy = Math.floor(img.height * 0.42);
  const sh = Math.floor(img.height * 0.5);
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, WALL_TEXTURE_SWATCH, WALL_TEXTURE_SWATCH);
  const pattern = ctx.createPattern(swatch, 'repeat');
  wallPatterns[tierIndex] = pattern;
  return pattern;
}
```

In the `Wall` class:

1. Repoint `sprite` at the tier texture (keeps `Terrain.sprite` meaningful; `tierIndex` is already a private getter):

```ts
get sprite(): ImageSource | null {
  return wallTextureFor(this.tierIndex);
}
```

2. Replace `getRenderInfo()` with the contiguous-mass renderer (locked params inlined; `dropShadow` folded into the south bevel per the per-tile decision). It reads `this.neighbors` and `this.connectsTo`; `this.col`/`this.row` (set by `attach`) anchor the texture pattern to the grid so it stays continuous across connected tiles:

```ts
getRenderInfo(): TileRenderInfo {
  const tier = this.tierIndex;
  const nb = this.neighbors;
  const cN = this.connectsTo(nb.north);
  const cS = this.connectsTo(nb.south);
  const cE = this.connectsTo(nb.east);
  const cW = this.connectsTo(nb.west);
  const mask = `${+cN}${+cS}${+cE}${+cW}`;
  // Position is in the key because the grid-anchored pattern phase depends on it.
  const cacheKey = `wall:${tier}:${mask}:${this.col}:${this.row}`;

  const BEVEL = 0.58;
  const BW = 3;
  const RAD = 10;
  const OUT = 0.34;
  const SHADOW = 0.24;

  return {
    sprite: null,
    tint: null,
    cacheKey,
    customDraw: (ctx, w, h) => {
      const tl = (!cN && !cW) ? RAD : 0;
      const tr = (!cN && !cE) ? RAD : 0;
      const br = (!cS && !cE) ? RAD : 0;
      const bl = (!cS && !cW) ? RAD : 0;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, [tl, tr, br, bl]);
      ctx.clip();

      const pattern = getWallPattern(ctx, tier);
      if (pattern) {
        const phaseX = (this.col * w) % WALL_TEXTURE_SWATCH;
        const phaseY = (this.row * h) % WALL_TEXTURE_SWATCH;
        pattern.setTransform(new DOMMatrix().translateSelf(-phaseX, -phaseY));
        ctx.fillStyle = pattern;
      } else {
        const fallback = elevationToColor(this.height);
        ctx.fillStyle = `rgb(${fallback.r},${fallback.g},${fallback.b})`;
      }
      ctx.fillRect(0, 0, w, h);

      // Bevel: sun from the north. Highlight on exposed north edge; the south
      // sliver carries both the bevel shadow and the (folded-in) drop shadow.
      if (!cN) {
        ctx.fillStyle = `rgba(255,250,235,${BEVEL})`;
        ctx.fillRect(0, 0, w, BW);
      }
      if (!cS) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, BEVEL * 0.85 + SHADOW)})`;
        ctx.fillRect(0, h - BW, w, BW);
      }

      ctx.restore();

      // Outline on exposed edges (drawn on the rounded path, after the clip).
      ctx.strokeStyle = `rgba(40,25,10,${OUT})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (!cN) { ctx.moveTo(tl, 0.5); ctx.lineTo(w - tr, 0.5); }
      if (!cS) { ctx.moveTo(bl, h - 0.5); ctx.lineTo(w - br, h - 0.5); }
      if (!cW) { ctx.moveTo(0.5, tl); ctx.lineTo(0.5, h - bl); }
      if (!cE) { ctx.moveTo(w - 0.5, tr); ctx.lineTo(w - 0.5, h - br); }
      ctx.stroke();
    },
  };
}
```

3. Remove the now-dead tint computation that the old `getRenderInfo` returned (the `tiers`/`t`/`r`/`g`/`b` block).

**Step 4: Run to verify it passes**

Run: `node --run test:unit`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/model/terrain.ts src/model/terrain.test.ts
git commit -m "feat: render walls as a contiguous mass via procedural customDraw"
```

---

## Task B3: Retire the wall spritesheet

**Files:**
- Modify: `src/model/terrain.ts` (remove `getWallSpriteSheet`, the spritesheet constants, the import)
- Modify: `src/resources.ts` (remove `WallSpritesheet` def + loader entry)
- Delete: `public/images/wall-spritesheet.png`

**Step 1: Confirm it is unused**

Run: `grep -rn "WallSpritesheet\|getWallSpriteSheet\|wallSpriteSheet" src/`
Expected: the only remaining hits are the definition sites about to be removed (`terrain.ts` `getWallSpriteSheet` + `Wall.sprite` no longer references it after B2; `resources.ts` def + loader). If anything else references them, STOP and reassess.

**Step 2: Implement**

In `src/model/terrain.ts`:
- Delete `WALL_SPRITE_SIZE`, `WALL_SPRITE_MARGIN`, the `wallSpriteSheet` module variable, and the `getWallSpriteSheet()` function (~lines 5–26).
- Remove `SpriteSheet` from the excalibur import if no longer used (check first — `Sprite`/`Color`/`ImageSource` stay).

In `src/resources.ts`:
- Remove `WallSpritesheet: new ImageSource('./images/wall-spritesheet.png'),` from `Resources`.
- Remove `Resources.WallSpritesheet,` from the `loader` array.

Delete the asset:

```bash
rm public/images/wall-spritesheet.png
```

> This deletes a checked-in asset. It is only referenced by the code removed in this task (confirmed in Step 1) and is reversible via git. Proceed.

**Step 3: Verify**

Run: `node --run lint && node --run build && node --run test:unit`
Expected: all PASS.

**Step 4: Commit**

```bash
git add src/model/terrain.ts src/resources.ts public/images/wall-spritesheet.png
git commit -m "refactor: retire wall spritesheet in favor of per-tier textures"
```

---

## Task B4: Update visual baselines + docs

**Files:**
- Update: Playwright snapshots in `tests/main.spec.ts-snapshots/`
- Modify: `docs/gameplay.md`, `AGENTS.md`

**Step 1: Regenerate the visual baselines (intentional change)**

The wall look has changed by design, so the old baselines are expected to diff. Regenerate them:

Run: `npm run test:integration-update`
Expected: snapshots updated. Then re-run `node --run test:integration` and confirm it PASSES against the new baselines.

> Before committing the new PNGs, eyeball at least one updated wall snapshot to confirm walls read as a contiguous mass (continuous texture across connected tiles; outline/bevel/rounded corners only on the perimeter). If they look wrong, STOP — do not commit broken baselines.

**Step 2: Update docs**

- `docs/gameplay.md`: update any wall-rendering description to reflect the contiguous-mass procedural rendering (replace spritesheet/tier-sprite wording).
- `AGENTS.md`: in the `src/model/terrain.ts` and `src/view/tile.ts` core-file notes, mention that walls render procedurally as a contiguous mass from `Terrain.neighbors`/`connectsTo` (no more wall spritesheet).

**Step 3: Verify**

Run: `node --run lint && node --run build && node --run test:unit && node --run test:integration`
Expected: all PASS.

**Step 4: Commit**

```bash
git add tests/main.spec.ts-snapshots docs/gameplay.md AGENTS.md
git commit -m "docs: update baselines and docs for contiguous wall rendering"
```

---

## Deferred (not in this plan)

- **Tier-4 texture rework** (flagged in the design doc). This is an art-asset task, not code, so it is out of scope for automated execution. The code samples whatever `wall-level-4.png` contains; reworking the art can land separately without touching this plan's code.

---

## Done criteria

- [ ] Part A: `Hole` renders from `this.neighbors`; `poolNeighborFlags` field + `detectPools` write + `PoolNeighborFlags` removed; `TileRenderInfo.cacheKey` drives the tile cache; view no longer threads neighbors; Playwright baselines unchanged through Task A3.
- [ ] `Resources.WallLevel1..4` registered and loaded.
- [ ] `Wall.getRenderInfo()` returns a `customDraw` that reads `this.neighbors`/`connectsTo`, fills a grid-anchored tier texture, and draws outline/bevel/rounded-corner/south-shadow only on exposed edges; `cacheKey` keyed by tier + mask + position.
- [ ] `Wall.sprite` returns the tier texture; wall spritesheet code + asset removed; no dangling references.
- [ ] `docs/gameplay.md` and `AGENTS.md` updated; Playwright baselines regenerated and visually confirmed.
- [ ] `node --run lint && node --run build && node --run test:unit && node --run test:integration` all green.
