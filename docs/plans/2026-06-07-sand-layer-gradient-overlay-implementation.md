# Sand-Layer Gradient Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing moist-sand tilemap while replacing hard directional transition sprites with a shared wet-sand gradient overlay.

**Architecture:** `SandLayer` keeps its binary `"moist" | "cleared"` state and its existing tilemap, but gains a shared overlay actor backed by one Excalibur `Canvas`. Cleared cells clear their own moist tile graphics while the overlay repaints wet-sand boundary stamps over the moist/cleared seam.

**Tech Stack:** TypeScript, Excalibur `TileMap`/`Actor`/`Canvas`, Vitest.

---

### Task 1: Add tests for gradient-renderer behavior

**Files:**
- Modify: `src/view/sand-layer.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that exercise behavior instead of configuration details:

```ts
test("clears covered cells but keeps deeper moist tiles plain", () => {
  const { layer, tilemap } = makeSandLayer();
  layer.coverCell(5, INITIAL_MOIST_GAME_ROW);

  expect(getGraphic(tilemap, 5, INITIAL_MOIST_GAME_ROW)).toBeUndefined();
  expect(sourceCoord(getGraphic(tilemap, 5, INITIAL_MOIST_GAME_ROW + 2))).toEqual([1, 9]);
});

test("creates and reuses one overlay actor", () => {
  const { layer, overlayActor } = makeSandLayer();
  layer.coverCell(5, INITIAL_MOIST_GAME_ROW);
  layer.coverCell(5, INITIAL_MOIST_GAME_ROW + 1);

  expect(getOverlayActor(layer)).toBe(overlayActor);
});

test("top moist row renders as plain moist", () => {
  const { tilemap } = makeSandLayer();
  expect(sourceCoord(getGraphic(tilemap, 0, INITIAL_MOIST_GAME_ROW))).toEqual([1, 9]);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --run test:unit -- sand-layer`
Expected: FAIL until the single-renderer test expectations match production behavior.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/view/sand-layer.test.ts
git commit -m "test: cover sand layer render modes"
```

### Task 2: Add shared overlay rendering to `SandLayer`

**Files:**
- Modify: `src/view/sand-layer.ts`

- [ ] **Step 1: Extend `SandLayer` with overlay fields**

Add shared overlay state:

```ts
private readonly overlay: Actor;
private readonly overlayGraphic: Canvas;
private readonly overlaySize = {
  width: GRID_WIDTH * TILED_TILE_SIZE,
  height: TILEMAP_ROWS * TILED_TILE_SIZE,
};
```

- [ ] **Step 2: Initialize the overlay actor**

Construct the shared overlay once, align it with the tilemap, and add it to the scene:

```ts
constructor(
  scene: Scene,
  mapX: number,
  mapY: number,
  tileScale: number,
  image: ImageSource,
) {
  this.overlayGraphic = new Canvas({
    width: this.overlaySize.width,
    height: this.overlaySize.height,
    cache: false,
    draw: (ctx) => this.drawOverlay(ctx),
  });
  this.overlay = new Actor({
    pos: vec(mapX + (this.overlaySize.width * tileScale) / 2, mapY + (this.overlaySize.height * tileScale) / 2),
    width: this.overlaySize.width * tileScale,
    height: this.overlaySize.height * tileScale,
  });
  this.overlay.scale = vec(tileScale, tileScale);
  this.overlay.z = SAND_LAYER_Z + 0.01;
  this.overlay.graphics.use(this.overlayGraphic);
}
```

- [ ] **Step 3: Keep tile rendering plain/moist only**

Always render non-cleared tiles as plain moist:

```ts
private repaintCell(col: number, gameRow: number): void {
  // bounds/tile lookup unchanged
  tile.clearGraphics();
  if (this.states[gameRow][col] === "cleared") {
    return;
  }
  tile.addGraphic(this.getSprite(MOIST));
}
```

- [ ] **Step 4: Add shared overlay repainting**

Draw one boundary stamp per cleared cell:

```ts
private drawOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, this.overlaySize.width, this.overlaySize.height);
  for (let gameRow = 0; gameRow < TILEMAP_GAME_ROWS; gameRow++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      if (this.states[gameRow][col] !== "cleared") {
        continue;
      }
      this.drawWetStamp(ctx, col, gameRow);
    }
  }
}
```

- [ ] **Step 5: Refresh overlay after state changes**

When `coverCell`, `refresh`, or `reset` mutate or rebuild state, invalidate the overlay once:

```ts
private redrawOverlay(): void {
  this.overlay.graphics.use(this.overlayGraphic.clone());
}
```

Use a minimal equivalent that forces Excalibur to redraw the canvas without reallocating actors.

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `node --run test:unit -- sand-layer`
Expected: PASS.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/view/sand-layer.ts src/view/sand-layer.test.ts
git commit -m "feat: add sand layer gradient overlay mode"
```

### Task 3: Verify integration behavior stays intact

**Files:**
- Modify: `src/level-session.ts`
- Modify: `src/tide-session.ts`
- Modify: `docs/gameplay.md`

- [ ] **Step 1: Confirm sessions keep using the default `SandLayer` mode**

No call-site change is required; `SandLayer` only exposes the gradient renderer.

- [ ] **Step 2: Update gameplay docs for the new visual behavior**

Add one concise note to the wave-phase visuals section:

```md
- The moist sand overlay clears permanently where waves cover tiles and now softens the wet/dry boundary with a shared radial fade into neighboring tiles.
```

- [ ] **Step 3: Run targeted verification**

Run:

```bash
node --run test:unit -- sand-layer
node --run test:unit -- wave-event-applier
```

Expected: PASS.

- [ ] **Step 4: Commit the doc/integration touch-ups**

```bash
git add src/level-session.ts src/tide-session.ts docs/gameplay.md
git commit -m "docs: describe sand layer gradient transition"
```

### Task 4: Run broader verification

**Files:**
- No file changes expected

- [ ] **Step 1: Run full unit tests**

Run: `node --run test:unit`
Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `node --run lint`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `node --run build`
Expected: PASS.
