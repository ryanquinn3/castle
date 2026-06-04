# Wave Segment Actor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace snapshot-driven wave runtime with one velocity-driven `WaveSegment` actor per column.

**Architecture:** Create a new `src/wave/` runtime area. `WaveSegment` owns actor movement and tile-entry decisions, `WaveActorRuntime` spawns and tracks segments, and `WaveEventApplier` mutates `GridView`/`GridModel` immediately when segment events fire. Keep the old `simulateWave()` model code for now.

**Tech Stack:** TypeScript, Excalibur.js actors, Vite, Vitest, existing `GridModel`/`GridView` terrain APIs.

---

## Implementation rules

- Do not start a dev server. One is already running.
- Do not remove `simulateWave()` in this milestone.
- Do not commit unless the user explicitly asks for commits.
- Run targeted unit tests after each task. Run `node --run test:unit`, `node --run lint`, and `node --run build` at the end.
- If gameplay behavior changes, update `docs/gameplay.md` in the same implementation.

## File map

- Create `src/wave/wave-segment-types.ts`: shared wave actor state, spawn, grid adapter, event, and result types.
- Create `src/wave/wave-spawner.ts`: converts existing wave height parameters into `WaveSegmentSpawn[]` with noise-shaped spawn `y` offsets.
- Create `src/wave/wave-spawner.test.ts`: verifies spawn count, depth curve reuse, deterministic noise offsets, and bounds.
- Create `src/wave/wave-segment.ts`: `WaveSegment extends Actor`; owns velocity movement, row crossing, tile interaction, event emission, and surge/crash/recede lifecycle.
- Create `src/wave/wave-segment.test.ts`: verifies row entry events and lifecycle transitions with a mocked Excalibur actor.
- Create `src/wave/wave-event-applier.ts`: receives `WaveSegmentEvent` and mutates `GridView` immediately.
- Create `src/wave/wave-event-applier.test.ts`: verifies puddle, erosion, sand redistribution, and castle flood event handling.
- Create `src/wave/wave-actor-runtime.ts`: spawns segments into a scene, wires event listeners to `WaveEventApplier`, waits for all segments to dissipate, and cleans up.
- Create `src/wave/wave-actor-runtime.test.ts`: verifies segment spawning, result aggregation, and cleanup.
- Modify `src/model/grid-model.ts`: add single-tile helpers for immediate actor events.
- Modify `src/view/grid-view.ts`: expose single-tile helpers that refresh visuals after model mutation.
- Modify `src/level-session.ts`: use actor runtime for Classic waves.
- Modify `src/tide-session.ts`: use actor runtime for Tide waves.
- Modify `src/config.ts`: add first-pass actor wave constants.
- Modify `docs/gameplay.md`: document actor-based wave behavior and no lateral spread in the first actor runtime.

---

### Task 1: Add spawn generation and shared types

**Files:**
- Create: `src/wave/wave-segment-types.ts`
- Create: `src/wave/wave-spawner.ts`
- Create: `src/wave/wave-spawner.test.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Add actor wave constants to `src/config.ts`**

Add these exports near existing wave constants:

```ts
/** Pixel speed for actor-driven wave segments during the surge phase. */
export const WAVE_SEGMENT_SURGE_SPEED = 90;
/** Pixel speed for actor-driven wave segments during the recede phase. */
export const WAVE_SEGMENT_RECEDE_SPEED = -45;
/** Maximum organic front offset, in pixels, applied to actor wave spawn Y. */
export const WAVE_FRONT_NOISE_AMPLITUDE = 50;
/** Frequency used by the deterministic actor wave front noise helper. */
export const WAVE_FRONT_NOISE_FREQUENCY = 0.2;
/** Extra pixel travel distance per unit of starting depth. */
export const WAVE_SEGMENT_TRAVEL_PER_DEPTH = 350;
/** Base pixel travel distance before starting-depth scaling. */
export const WAVE_SEGMENT_BASE_TRAVEL = 150;
```

- [ ] **Step 2: Create shared wave types**

Create `src/wave/wave-segment-types.ts`:

```ts
import type { Tile } from '../view/tile.ts';

export type WaveState = 'surging' | 'crashing' | 'receding' | 'dead';

export interface WaveSegmentSpawn {
  col: number;
  x: number;
  y: number;
  initialDepth: number;
  speed: number;
  recedeSpeed: number;
  maxTravelDistance: number;
}

export interface WaveSegmentGrid {
  gridTop: number;
  tileSize: number;
  height: number;
  getElevation(col: number, row: number): number;
  effectiveHoleDepth(col: number, row: number): number;
  isCastle(col: number, row: number): boolean;
}

export type WaveSegmentEvent =
  | { type: 'tileEntered'; col: number; row: number; depth: number }
  | { type: 'blocked'; col: number; row: number; depth: number }
  | { type: 'overtopped'; col: number; row: number; depth: number }
  | { type: 'absorbed'; col: number; row: number; depth: number; absorbedDepth: number }
  | { type: 'castleFlooded'; col: number; row: number; depth: number }
  | { type: 'dissipated'; col: number; row: number };

export interface WaveEventApplyResult {
  castleFlooded: boolean;
  erodedTile: Tile | null;
  sandRedistributed: boolean;
}

export interface WaveActorRuntimeResult {
  castleFlooded: boolean;
  erodedTiles: Tile[];
  sandRedistributed: boolean;
  events: WaveSegmentEvent[];
}
```

- [ ] **Step 3: Write failing spawner tests**

Create `src/wave/wave-spawner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WAVE_SEGMENT_BASE_TRAVEL, WAVE_SEGMENT_SURGE_SPEED } from '../config.ts';
import { generateWaveSegmentSpawns } from './wave-spawner.ts';

describe('generateWaveSegmentSpawns', () => {
  it('creates one spawn per column', () => {
    const spawns = generateWaveSegmentSpawns({
      numCols: 4,
      tileSize: 16,
      gridLeft: 100,
      gridTop: 200,
      peakHeight: 4,
      valleyFraction: 0.5,
      peakPhase: 0,
      numPeaks: 1,
      waveIndex: 1,
    });

    expect(spawns).toHaveLength(4);
    expect(spawns.map(s => s.col)).toEqual([0, 1, 2, 3]);
    expect(spawns[0].x).toBe(108);
    expect(spawns[1].x).toBe(124);
    expect(spawns[0].speed).toBe(WAVE_SEGMENT_SURGE_SPEED);
  });

  it('keeps existing peak and valley depth shape', () => {
    const spawns = generateWaveSegmentSpawns({
      numCols: 3,
      tileSize: 16,
      gridLeft: 0,
      gridTop: 0,
      peakHeight: 4,
      valleyFraction: 0.5,
      peakPhase: 0,
      numPeaks: 1,
      waveIndex: 1,
    });

    expect(spawns.map(s => Math.round(s.initialDepth * 100) / 100)).toEqual([2, 4, 2]);
  });

  it('uses deterministic staggered y offsets', () => {
    const first = generateWaveSegmentSpawns({
      numCols: 4,
      tileSize: 16,
      gridLeft: 0,
      gridTop: 100,
      peakHeight: 4,
      valleyFraction: 0.5,
      peakPhase: 0,
      numPeaks: 1,
      waveIndex: 7,
    });
    const second = generateWaveSegmentSpawns({
      numCols: 4,
      tileSize: 16,
      gridLeft: 0,
      gridTop: 100,
      peakHeight: 4,
      valleyFraction: 0.5,
      peakPhase: 0,
      numPeaks: 1,
      waveIndex: 7,
    });

    expect(second.map(s => s.y)).toEqual(first.map(s => s.y));
    expect(new Set(first.map(s => s.y)).size).toBeGreaterThan(1);
    for (const spawn of first) {
      expect(spawn.y).toBeLessThan(100);
      expect(spawn.maxTravelDistance).toBeGreaterThan(WAVE_SEGMENT_BASE_TRAVEL);
    }
  });
});
```

- [ ] **Step 4: Run the failing spawner test**

Run: `node --run test:unit -- src/wave/wave-spawner.test.ts`

Expected: FAIL because `src/wave/wave-spawner.ts` does not exist.

- [ ] **Step 5: Implement spawner**

Create `src/wave/wave-spawner.ts`:

```ts
import {
  WAVE_FRONT_NOISE_AMPLITUDE,
  WAVE_FRONT_NOISE_FREQUENCY,
  WAVE_SEGMENT_BASE_TRAVEL,
  WAVE_SEGMENT_RECEDE_SPEED,
  WAVE_SEGMENT_SURGE_SPEED,
  WAVE_SEGMENT_TRAVEL_PER_DEPTH,
} from '../config.ts';
import { generateWaveCurve } from '../model/wave-simulation.ts';
import type { WaveSegmentSpawn } from './wave-segment-types.ts';

export interface GenerateWaveSegmentSpawnsInput {
  numCols: number;
  tileSize: number;
  gridLeft: number;
  gridTop: number;
  peakHeight: number;
  valleyFraction: number;
  peakPhase: number;
  numPeaks: number;
  waveIndex: number;
}

function frontNoise(col: number, waveIndex: number): number {
  const seed = Math.sin((col * 12.9898 + waveIndex * 78.233) * WAVE_FRONT_NOISE_FREQUENCY) * 43758.5453;
  return (seed - Math.floor(seed)) * 2 - 1;
}

export function generateWaveSegmentSpawns(input: GenerateWaveSegmentSpawnsInput): WaveSegmentSpawn[] {
  const depths = generateWaveCurve(
    input.numCols,
    input.peakHeight,
    input.valleyFraction,
    input.peakPhase,
    input.numPeaks,
  );
  const ySpawnBase = input.gridTop - input.tileSize * 3;

  return depths.map((initialDepth, col) => ({
    col,
    x: input.gridLeft + col * input.tileSize + input.tileSize / 2,
    y: Math.min(
      input.gridTop - 1,
      ySpawnBase + frontNoise(col, input.waveIndex) * WAVE_FRONT_NOISE_AMPLITUDE,
    ),
    initialDepth,
    speed: WAVE_SEGMENT_SURGE_SPEED,
    recedeSpeed: WAVE_SEGMENT_RECEDE_SPEED,
    maxTravelDistance: WAVE_SEGMENT_BASE_TRAVEL + initialDepth * WAVE_SEGMENT_TRAVEL_PER_DEPTH,
  }));
}
```

- [ ] **Step 6: Run spawner test again**

Run: `node --run test:unit -- src/wave/wave-spawner.test.ts`

Expected: PASS.

---

### Task 2: Add `WaveSegment` actor

**Files:**
- Create: `src/wave/wave-segment.ts`
- Create: `src/wave/wave-segment.test.ts`

- [ ] **Step 1: Write failing segment tests**

Create `src/wave/wave-segment.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { WaveSegment } from './wave-segment.ts';
import type { WaveSegmentEvent, WaveSegmentGrid, WaveSegmentSpawn } from './wave-segment-types.ts';

vi.mock('excalibur', () => {
  class Vector {
    static Zero = new Vector(0, 0);
    constructor(public x: number, public y: number) {}
  }

  class Actor {
    pos: Vector;
    vel: Vector;
    width: number;
    height: number;
    color: unknown;
    killed = false;
    graphics = { use: vi.fn() };
    actions = {
      delay: vi.fn(() => ({
        callMethod: (callback: () => void) => {
          callback();
          return {
            fade: () => ({
              callMethod: (done: () => void) => {
                done();
              },
            }),
          };
        },
      })),
    };

    constructor(options: { pos: Vector; width: number; height: number; vel: Vector; color?: unknown }) {
      this.pos = options.pos;
      this.vel = options.vel;
      this.width = options.width;
      this.height = options.height;
      this.color = options.color;
    }

    kill(): void {
      this.killed = true;
    }
  }

  return {
    Actor,
    Color: {
      White: 'white',
      fromRGB: vi.fn((r: number, g: number, b: number, a?: number) => ({ r, g, b, a })),
    },
    Vector,
  };
});

function spawn(input: Partial<WaveSegmentSpawn> = {}): WaveSegmentSpawn {
  return {
    col: 1,
    x: 24,
    y: -16,
    initialDepth: 4,
    speed: 90,
    recedeSpeed: -45,
    maxTravelDistance: 300,
    ...input,
  };
}

function grid(overrides: Partial<WaveSegmentGrid> = {}): WaveSegmentGrid {
  return {
    gridTop: 0,
    tileSize: 16,
    height: 4,
    getElevation: () => 0,
    effectiveHoleDepth: () => 0,
    isCastle: () => false,
    ...overrides,
  };
}

describe('WaveSegment', () => {
  it('emits tileEntered when velocity carries it into a row', () => {
    const events: WaveSegmentEvent[] = [];
    const segment = new WaveSegment(spawn(), grid(), 0.5);
    segment.onWaveEvent(event => events.push(event));

    segment.pos.y = 8;
    segment.onPostUpdate({} as never, 16);

    expect(events).toContainEqual({ type: 'tileEntered', col: 1, row: 0, depth: 4 });
    expect(segment.state).toBe('surging');
  });

  it('blocks and crashes when elevation meets depth', () => {
    const events: WaveSegmentEvent[] = [];
    const segment = new WaveSegment(spawn({ initialDepth: 2 }), grid({ getElevation: () => 2 }), 0.5);
    segment.onWaveEvent(event => events.push(event));

    segment.pos.y = 8;
    segment.onPostUpdate({} as never, 16);

    expect(events).toContainEqual({ type: 'blocked', col: 1, row: 0, depth: 2 });
    expect(segment.state).toBe('dead');
  });

  it('absorbs into holes and crashes when no depth remains', () => {
    const events: WaveSegmentEvent[] = [];
    const segment = new WaveSegment(
      spawn({ initialDepth: 2 }),
      grid({ getElevation: () => -3, effectiveHoleDepth: () => 3 }),
      0.5,
    );
    segment.onWaveEvent(event => events.push(event));

    segment.pos.y = 8;
    segment.onPostUpdate({} as never, 16);

    expect(events).toContainEqual({ type: 'absorbed', col: 1, row: 0, depth: 2, absorbedDepth: 2 });
    expect(events[events.length - 1].type).toBe('dissipated');
  });

  it('emits castleFlooded when entering a castle tile', () => {
    const events: WaveSegmentEvent[] = [];
    const segment = new WaveSegment(spawn(), grid({ isCastle: () => true }), 0.5);
    segment.onWaveEvent(event => events.push(event));

    segment.pos.y = 8;
    segment.onPostUpdate({} as never, 16);

    expect(events).toContainEqual({ type: 'castleFlooded', col: 1, row: 0, depth: 4 });
  });
});
```

- [ ] **Step 2: Run the failing segment test**

Run: `node --run test:unit -- src/wave/wave-segment.test.ts`

Expected: FAIL because `src/wave/wave-segment.ts` does not exist.

- [ ] **Step 3: Implement `WaveSegment`**

Create `src/wave/wave-segment.ts`:

```ts
import { Actor, Color, Vector, type Engine } from 'excalibur';
import type { WaveSegmentEvent, WaveSegmentGrid, WaveSegmentSpawn, WaveState } from './wave-segment-types.ts';

type WaveSegmentListener = (event: WaveSegmentEvent) => void;

const CRASH_PAUSE_MS = 250;
const FADE_MS = 600;
const MIN_DEPTH = 0.05;

function depthColor(depth: number): Color {
  const t = Math.min(Math.max((depth - 1) / 8, 0), 1);
  const r = Math.round(180 * (1 - t));
  const g = Math.round(220 * (1 - t) + 10);
  const a = 0.35 + t * 0.55;
  return Color.fromRGB(r, g, 255, a);
}

export class WaveSegment extends Actor {
  state: WaveState = 'surging';
  currentDepth: number;

  private readonly listeners = new Set<WaveSegmentListener>();
  private readonly spawnY: number;
  private lastEnteredRow = -1;

  constructor(
    private readonly spawn: WaveSegmentSpawn,
    private readonly grid: WaveSegmentGrid,
    private readonly terrainSlope: number,
  ) {
    super({
      pos: new Vector(spawn.x, spawn.y),
      width: Math.max(4, grid.tileSize - 2),
      height: 16 + spawn.initialDepth * 4,
      vel: new Vector(0, spawn.speed),
      color: depthColor(spawn.initialDepth),
      name: 'WaveSegment',
    });
    this.currentDepth = spawn.initialDepth;
    this.spawnY = spawn.y;
  }

  onWaveEvent(listener: WaveSegmentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  override onPostUpdate(_engine: Engine, _delta: number): void {
    if (this.state !== 'surging') {
      return;
    }

    this.handleTileEntries();
    this.handleTravelDissipation();
    this.updateVisualState();
  }

  private handleTileEntries(): void {
    const enteredRow = Math.floor((this.pos.y - this.grid.gridTop) / this.grid.tileSize);
    if (enteredRow < 0 || enteredRow <= this.lastEnteredRow) {
      return;
    }

    for (let row = this.lastEnteredRow + 1; row <= enteredRow; row++) {
      if (row < 0) {
        continue;
      }
      if (row >= this.grid.height) {
        this.triggerRecession();
        return;
      }
      this.enterRow(row);
      if (this.state !== 'surging') {
        return;
      }
    }

    this.lastEnteredRow = enteredRow;
  }

  private enterRow(row: number): void {
    const col = this.spawn.col;
    this.emitWaveEvent({ type: 'tileEntered', col, row, depth: this.currentDepth });

    if (this.grid.isCastle(col, row)) {
      this.emitWaveEvent({ type: 'castleFlooded', col, row, depth: this.currentDepth });
      this.triggerRecession();
      return;
    }

    const elevation = this.grid.getElevation(col, row);
    if (elevation > 0) {
      if (elevation >= this.currentDepth) {
        this.emitWaveEvent({ type: 'blocked', col, row, depth: this.currentDepth });
        this.currentDepth = 0;
        this.triggerRecession();
        return;
      }
      this.currentDepth -= elevation;
      this.emitWaveEvent({ type: 'overtopped', col, row, depth: this.currentDepth });
    } else if (elevation < 0) {
      const absorbedDepth = Math.min(this.currentDepth, this.grid.effectiveHoleDepth(col, row));
      if (absorbedDepth > 0) {
        this.currentDepth -= absorbedDepth;
        this.emitWaveEvent({ type: 'absorbed', col, row, depth: this.currentDepth + absorbedDepth, absorbedDepth });
      }
    } else {
      this.currentDepth -= this.terrainSlope;
    }

    if (this.currentDepth <= MIN_DEPTH) {
      this.triggerRecession();
    }
  }

  private handleTravelDissipation(): void {
    const traveled = this.pos.y - this.spawnY;
    if (traveled >= this.spawn.maxTravelDistance) {
      this.triggerRecession();
    }
  }

  private updateVisualState(): void {
    this.height = 16 + Math.max(this.currentDepth, 0) * 4;
    this.color = depthColor(this.currentDepth);
  }

  private triggerRecession(): void {
    if (this.state !== 'surging') {
      return;
    }

    this.state = 'crashing';
    this.vel = Vector.Zero;
    this.color = Color.White;

    this.actions.delay(CRASH_PAUSE_MS).callMethod(() => {
      this.state = 'receding';
      this.vel = new Vector(0, this.spawn.recedeSpeed);
    }).fade(0, FADE_MS).callMethod(() => {
      this.state = 'dead';
      this.emitWaveEvent({ type: 'dissipated', col: this.spawn.col, row: Math.max(this.lastEnteredRow, 0) });
      this.kill();
    });
  }

  private emitWaveEvent(event: WaveSegmentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
```

- [ ] **Step 4: Run segment tests**

Run: `node --run test:unit -- src/wave/wave-segment.test.ts`

Expected: PASS. If the Excalibur `ActionSequence` type does not support the exact chain above, keep the same behavior and adjust only the chaining syntax to match the installed Excalibur API.

---

### Task 3: Add immediate grid mutation helpers

**Files:**
- Modify: `src/model/grid-model.ts`
- Modify: `src/view/grid-view.ts`
- Create: `src/wave/wave-event-applier.ts`
- Create: `src/wave/wave-event-applier.test.ts`

- [ ] **Step 1: Write failing event applier tests**

Create `src/wave/wave-event-applier.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CASTLE_HEIGHT, CASTLE_WIDTH } from '../config.ts';
import { GridModel } from '../model/grid-model.ts';
import type { GridView } from '../view/grid-view.ts';
import { WaveEventApplier } from './wave-event-applier.ts';

function makeGridView(): GridView {
  const model = new GridModel({
    width: 4,
    height: 4,
    castleCol: 2,
    castleRow: 2,
    castleWidth: CASTLE_WIDTH,
    castleHeight: CASTLE_HEIGHT,
  });
  return {
    model,
    applyWaveWaterHit: (col: number, row: number, depth: number) => {
      const result = model.applyWaveWaterHit(col, row, depth);
      return result ? ({ col, row } as never) : null;
    },
    applyActorPuddleDelta: (col: number, row: number, depth: number) => {
      model.applyPuddleDeltas([{ col, row, depth }]);
    },
    applyActorSandRedistribution: (col: number, row: number) => model.applySandRedistributionAt(col, row),
  } as unknown as GridView;
}

describe('WaveEventApplier', () => {
  it('applies absorbed events as puddles', () => {
    const grid = makeGridView();
    grid.model.setElevation(1, 1, -3);
    const applier = new WaveEventApplier(grid);

    applier.apply({ type: 'absorbed', col: 1, row: 1, depth: 2, absorbedDepth: 2 });

    expect(grid.model.getPuddleDepth(1, 1)).toBe(2);
  });

  it('counts every water hit toward erosion', () => {
    const grid = makeGridView();
    grid.model.setElevation(1, 1, 2);
    const applier = new WaveEventApplier(grid);

    applier.apply({ type: 'tileEntered', col: 1, row: 1, depth: 5 });
    applier.apply({ type: 'tileEntered', col: 1, row: 1, depth: 5 });
    const result = applier.apply({ type: 'tileEntered', col: 1, row: 1, depth: 5 });

    expect(result.erodedTile).not.toBeNull();
    expect(grid.model.getElevation(1, 1)).toBe(1);
  });

  it('redistributes sand for blocked and overtopped events', () => {
    const grid = makeGridView();
    grid.model.setElevation(1, 1, 2);
    const applier = new WaveEventApplier(grid);

    const result = applier.apply({ type: 'blocked', col: 1, row: 1, depth: 2 });

    expect(result.sandRedistributed).toBe(true);
    expect(grid.model.getElevation(1, 1)).toBe(1);
  });

  it('reports castle flooding', () => {
    const grid = makeGridView();
    const applier = new WaveEventApplier(grid);

    const result = applier.apply({ type: 'castleFlooded', col: 2, row: 2, depth: 3 });

    expect(result.castleFlooded).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing event applier test**

Run: `node --run test:unit -- src/wave/wave-event-applier.test.ts`

Expected: FAIL because `WaveEventApplier`, `GridModel.applyWaveWaterHit`, and `GridModel.applySandRedistributionAt` do not exist.

- [ ] **Step 3: Add `GridModel` helpers**

In `src/model/grid-model.ts`, add these methods inside `GridModel` before `applyErosion`:

```ts
  applyWaveWaterHit(col: number, row: number, depth: number): ErosionResult | null {
    if (!this.inBounds(col, row) || this.isCastle(col, row)) {
      return null;
    }

    const cell = this.cells[row][col];
    if (depth - cell.elevation < 2) {
      return null;
    }

    const result = cell.applyHits(1);
    if (!result) {
      return null;
    }

    if (cell.elevation === 0) {
      this.setCell(col, row, new FlatGround());
    }
    this.detectPools();
    return { col, row, newElevation: result.newElevation };
  }

  applySandRedistributionAt(col: number, row: number): boolean {
    if (!this.inBounds(col, row) || this.isCastle(col, row)) {
      return false;
    }

    this.setElevation(col, row, -1);

    const upRow = row - 1;
    if (
      this.inBounds(col, upRow) &&
      !this.isCastle(col, upRow) &&
      this.cells[upRow][col] instanceof Hole
    ) {
      this.setElevation(col, upRow, +1);
    }

    return true;
  }
```

- [ ] **Step 4: Add `GridView` helpers**

In `src/view/grid-view.ts`, add these methods after `applyPuddleDeltas`:

```ts
  applyActorPuddleDelta(col: number, row: number, depth: number): void {
    this.model.applyPuddleDeltas([{ col, row, depth }]);
    this.refreshTileVisual(col, row);
    this.refreshPoolVisuals();
  }

  applyWaveWaterHit(col: number, row: number, depth: number): Tile | null {
    const result = this.model.applyWaveWaterHit(col, row, depth);
    if (!result) {
      return null;
    }
    this.refreshTileVisual(col, row);
    return this.getTile(col, row) ?? null;
  }

  applyActorSandRedistribution(col: number, row: number): boolean {
    const changed = this.model.applySandRedistributionAt(col, row);
    if (changed) {
      this.refreshTileVisual(col, row);
      this.refreshTileVisual(col, row - 1);
    }
    return changed;
  }
```

- [ ] **Step 5: Implement event applier**

Create `src/wave/wave-event-applier.ts`:

```ts
import type { GridView } from '../view/grid-view.ts';
import type { WaveEventApplyResult, WaveSegmentEvent } from './wave-segment-types.ts';

export class WaveEventApplier {
  constructor(private readonly grid: GridView) {}

  apply(event: WaveSegmentEvent): WaveEventApplyResult {
    const result: WaveEventApplyResult = {
      castleFlooded: false,
      erodedTile: null,
      sandRedistributed: false,
    };

    if (event.type === 'dissipated') {
      return result;
    }

    if (event.type === 'castleFlooded') {
      result.castleFlooded = true;
      return result;
    }

    if (event.type === 'absorbed') {
      this.grid.applyActorPuddleDelta(event.col, event.row, event.absorbedDepth);
      result.erodedTile = this.grid.applyWaveWaterHit(event.col, event.row, event.depth);
      return result;
    }

    if (event.type === 'blocked' || event.type === 'overtopped') {
      result.sandRedistributed = this.grid.applyActorSandRedistribution(event.col, event.row);
      result.erodedTile = this.grid.applyWaveWaterHit(event.col, event.row, event.depth);
      return result;
    }

    result.erodedTile = this.grid.applyWaveWaterHit(event.col, event.row, event.depth);
    return result;
  }
}
```

- [ ] **Step 6: Run event applier tests**

Run: `node --run test:unit -- src/wave/wave-event-applier.test.ts`

Expected: PASS.

---

### Task 4: Add actor runtime orchestration

**Files:**
- Create: `src/wave/wave-actor-runtime.ts`
- Create: `src/wave/wave-actor-runtime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `src/wave/wave-actor-runtime.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { WaveActorRuntime } from './wave-actor-runtime.ts';
import type { WaveSegmentSpawn } from './wave-segment-types.ts';

vi.mock('./wave-segment.ts', () => {
  class WaveSegment {
    listeners: ((event: unknown) => void)[] = [];
    constructor(public spawn: WaveSegmentSpawn) {}
    onWaveEvent(listener: (event: unknown) => void): () => void {
      this.listeners.push(listener);
      return () => {};
    }
    emit(event: unknown): void {
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }
  return { WaveSegment };
});

describe('WaveActorRuntime', () => {
  it('adds one segment per spawn and resolves when all dissipate', async () => {
    const added: unknown[] = [];
    const scene = { add: (actor: unknown) => added.push(actor), remove: vi.fn() };
    const grid = {
      gridTop: 0,
      tileSize: 16,
      height: 4,
      getElevation: () => 0,
      effectiveHoleDepth: () => 0,
      isCastle: () => false,
    };
    const applier = { apply: vi.fn(() => ({ castleFlooded: false, erodedTile: null, sandRedistributed: false })) };
    const runtime = new WaveActorRuntime(scene as never, grid, applier as never, 0.5);

    const promise = runtime.playWave([
      { col: 0, x: 8, y: -16, initialDepth: 2, speed: 90, recedeSpeed: -45, maxTravelDistance: 200 },
      { col: 1, x: 24, y: -16, initialDepth: 2, speed: 90, recedeSpeed: -45, maxTravelDistance: 200 },
    ]);

    expect(added).toHaveLength(2);
    (added[0] as { emit: (event: unknown) => void }).emit({ type: 'dissipated', col: 0, row: 1 });
    (added[1] as { emit: (event: unknown) => void }).emit({ type: 'dissipated', col: 1, row: 1 });

    const result = await promise;
    expect(result.castleFlooded).toBe(false);
    expect(result.events).toHaveLength(2);
  });

  it('aggregates castle flooding and cleanup removes active actors', async () => {
    const added: unknown[] = [];
    const scene = { add: (actor: unknown) => added.push(actor), remove: vi.fn() };
    const grid = {
      gridTop: 0,
      tileSize: 16,
      height: 4,
      getElevation: () => 0,
      effectiveHoleDepth: () => 0,
      isCastle: () => false,
    };
    const applier = {
      apply: vi.fn((event: { type: string }) => ({
        castleFlooded: event.type === 'castleFlooded',
        erodedTile: null,
        sandRedistributed: false,
      })),
    };
    const runtime = new WaveActorRuntime(scene as never, grid, applier as never, 0.5);

    const promise = runtime.playWave([
      { col: 0, x: 8, y: -16, initialDepth: 2, speed: 90, recedeSpeed: -45, maxTravelDistance: 200 },
    ]);
    (added[0] as { emit: (event: unknown) => void }).emit({ type: 'castleFlooded', col: 0, row: 2, depth: 2 });
    (added[0] as { emit: (event: unknown) => void }).emit({ type: 'dissipated', col: 0, row: 2 });

    const result = await promise;
    expect(result.castleFlooded).toBe(true);

    runtime.cleanup();
    expect(scene.remove).toHaveBeenCalledWith(added[0]);
  });
});
```

- [ ] **Step 2: Run failing runtime test**

Run: `node --run test:unit -- src/wave/wave-actor-runtime.test.ts`

Expected: FAIL because `WaveActorRuntime` does not exist.

- [ ] **Step 3: Implement runtime**

Create `src/wave/wave-actor-runtime.ts`:

```ts
import type { Scene } from 'excalibur';
import type { WaveEventApplier } from './wave-event-applier.ts';
import { WaveSegment } from './wave-segment.ts';
import type { WaveActorRuntimeResult, WaveSegmentEvent, WaveSegmentGrid, WaveSegmentSpawn } from './wave-segment-types.ts';

export class WaveActorRuntime {
  private readonly actors = new Set<WaveSegment>();

  constructor(
    private readonly scene: Scene,
    private readonly grid: WaveSegmentGrid,
    private readonly applier: WaveEventApplier,
    private readonly terrainSlope: number,
  ) {}

  playWave(spawns: WaveSegmentSpawn[]): Promise<WaveActorRuntimeResult> {
    const events: WaveSegmentEvent[] = [];
    const erodedTiles: WaveActorRuntimeResult['erodedTiles'] = [];
    let castleFlooded = false;
    let sandRedistributed = false;
    let remaining = spawns.length;

    if (remaining === 0) {
      return Promise.resolve({ castleFlooded: false, erodedTiles, sandRedistributed: false, events });
    }

    return new Promise(resolve => {
      const maybeResolve = () => {
        if (remaining > 0) {
          return;
        }
        resolve({ castleFlooded, erodedTiles, sandRedistributed, events });
      };

      for (const spawn of spawns) {
        const segment = new WaveSegment(spawn, this.grid, this.terrainSlope);
        this.actors.add(segment);
        segment.onWaveEvent((event) => {
          events.push(event);
          const applied = this.applier.apply(event);
          castleFlooded = castleFlooded || applied.castleFlooded;
          sandRedistributed = sandRedistributed || applied.sandRedistributed;
          if (applied.erodedTile) {
            erodedTiles.push(applied.erodedTile);
          }
          if (event.type === 'dissipated') {
            remaining--;
            maybeResolve();
          }
        });
        this.scene.add(segment);
      }
    });
  }

  cleanup(): void {
    for (const actor of this.actors) {
      this.scene.remove(actor);
    }
    this.actors.clear();
  }
}
```

- [ ] **Step 4: Run runtime tests**

Run: `node --run test:unit -- src/wave/wave-actor-runtime.test.ts`

Expected: PASS.

---

### Task 5: Wire actor runtime into Classic and Tide sessions

**Files:**
- Modify: `src/level-session.ts`
- Modify: `src/tide-session.ts`

- [ ] **Step 1: Add session imports**

In both `src/level-session.ts` and `src/tide-session.ts`, remove the current import from `./model/wave-simulation.ts`. It may use single or double quotes depending on the file:

```ts
import { simulateWave, generateWaveCurve } from './model/wave-simulation.ts';
import { simulateWave, generateWaveCurve } from "./model/wave-simulation.ts";
```

Add these imports:

```ts
import { WaveActorRuntime } from './wave/wave-actor-runtime.ts';
import { WaveEventApplier } from './wave/wave-event-applier.ts';
import { generateWaveSegmentSpawns } from './wave/wave-spawner.ts';
import type { WaveSegmentGrid } from './wave/wave-segment-types.ts';
```

- [ ] **Step 2: Add runtime fields to both sessions**

Add this field next to `waveRenderer` in `LevelSession` and `TideSession`:

```ts
  private waveRuntime: WaveActorRuntime | null = null;
```

- [ ] **Step 3: Add grid adapter helper in both sessions**

Add this private method in each session class:

```ts
  private makeWaveGridAdapter(): WaveSegmentGrid {
    return {
      gridTop: GRID_TOP,
      tileSize: TILE_SIZE,
      height: GRID_HEIGHT,
      getElevation: (col: number, row: number) => this.grid.model.getElevation(col, row),
      effectiveHoleDepth: (col: number, row: number) => this.grid.model.effectiveHoleDepth(col, row),
      isCastle: (col: number, row: number) => this.grid.model.isCastle(col, row),
    };
  }
```

In both `src/level-session.ts` and `src/tide-session.ts`, update the layout destructure near the top from:

```ts
const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, mapTop: MAP_TOP } = LAYOUT;
```

to:

```ts
const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP, mapTop: MAP_TOP } = LAYOUT;
```

- [ ] **Step 4: Replace Classic wave simulation block**

In `LevelSession.runWavePhase()`, replace the block that creates `columnHeights`, calls `simulateWave()`, calls `playWave(result)`, applies erosion, applies puddles, and applies sand redistribution with this actor path:

```ts
      const peakPhase = (Math.random() - 0.5) * 0.4;
      const totalWeight = WAVE_PEAK_WEIGHTS.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalWeight;
      let numPeaks = 1;
      for (let i = 0; i < WAVE_PEAK_WEIGHTS.length; i++) {
        r -= WAVE_PEAK_WEIGHTS[i];
        if (r <= 0) {
          numPeaks = i + 1;
          break;
        }
      }

      const spawns = generateWaveSegmentSpawns({
        numCols: GRID_WIDTH,
        tileSize: TILE_SIZE,
        gridLeft: GRID_LEFT,
        gridTop: GRID_TOP,
        peakHeight: waveHeight,
        valleyFraction: WAVE_VALLEY_FRACTION,
        peakPhase,
        numPeaks,
        waveIndex: this.state.level * 100 + k,
      });

      this.waveRuntime?.cleanup();
      this.waveRuntime = new WaveActorRuntime(
        this,
        this.makeWaveGridAdapter(),
        new WaveEventApplier(this.grid),
        TERRAIN_SLOPE,
      );
      const result = await this.waveRuntime.playWave(spawns);
      if (!this.lifecycle.isCurrent(sessionToken)) {
        return;
      }

      if (result.erodedTiles.length > 0) {
        await this.waveRenderer.flashErodedTiles(result.erodedTiles);
        if (!this.lifecycle.isCurrent(sessionToken)) {
          return;
        }
      }

      if (result.sandRedistributed) {
        await this.delay(260);
        if (!this.lifecycle.isCurrent(sessionToken)) {
          return;
        }
      }
```

Keep the existing `gameMode.resolveWave()` call, but feed it the actor runtime result:

```ts
      const transition = this.gameMode.resolveWave(this.state, {
        castleFlooded: result.castleFlooded,
        allWavesComplete: k === totalWaves,
      });
```

- [ ] **Step 5: Replace Tide wave simulation block**

In `TideSession.runWave()`, replace the `columnHeights`, `simulateWave()`, `playWave(result)`, erosion, puddle, and sand redistribution block with the same actor path. Use this wave index:

```ts
        waveIndex: this.state.wavesCompleted + 1,
```

Set debug column heights from spawns:

```ts
    this.lastColumnHeights = spawns.map(spawn => spawn.initialDepth);
```

Keep the existing planning lockout, toolbar disable, transition handling, high score, and countdown logic unchanged.

- [ ] **Step 6: Update cleanup paths**

In both session `cleanupGameplay`, `resetRunState`, and any game-over cleanup path that currently calls `this.waveRenderer.cleanup()`, also call:

```ts
    this.waveRuntime?.cleanup();
    this.waveRuntime = null;
```

In `LevelSession.advanceLevel()`, clean up the runtime before starting the next planning phase:

```ts
    this.waveRuntime?.cleanup();
    this.waveRuntime = null;
```

- [ ] **Step 7: Run TypeScript build**

Run: `node --run build`

Expected: PASS. Fix import, type, or Excalibur action chaining errors before continuing.

---

### Task 6: Update gameplay documentation

**Files:**
- Modify: `docs/gameplay.md`

- [ ] **Step 1: Update wave phase description**

In `docs/gameplay.md`, replace the first bullet list under `### 2. Wave phase` with:

```md
The wave advances automatically when the planning phase ends:
- The wave starts above the grid and advances downward as one Excalibur `WaveSegment` actor per column
- Each segment uses velocity-driven movement and enters tiles as it crosses row boundaries
- Each column starts with generated depth and a staggered noisy spawn offset, creating an uneven wave front
- Flat ground reduces segment depth by `TERRAIN_SLOPE` when entered
- Holes absorb segment depth, walls and towers block or reduce it, and castle entry ends the run
- The first actor runtime does not spread blocked water sideways; lateral flow will return later as actor behavior
```

- [ ] **Step 2: Update wave/tile interaction wording**

Replace the line `**Wave/tile interaction per column, per row:**` with:

```md
**Wave segment/tile interaction per column, per row entered:**
```

Replace the sentence below the interaction table:

```md
The wave phase plays out as an animation. Water advances row by row so the player can see how defenses performed.
```

with:

```md
The wave phase plays out as moving actors. Terrain changes apply as segment events fire, so repeated segment hits during a wave can erode or fill terrain immediately.
```

- [ ] **Step 3: Run docs-sensitive checks**

Run: `node --run test:unit -- src/wave`

Expected: PASS. This verifies the docs update did not come with unfinished code from earlier tasks.

---

### Task 7: Final verification and cleanup

**Files:**
- Review all modified files from previous tasks.

- [ ] **Step 1: Run targeted new wave tests**

Run: `node --run test:unit -- src/wave`

Expected: PASS.

- [ ] **Step 2: Run existing wave/model/view tests likely to catch regressions**

Run: `node --run test:unit -- src/model/wave-simulation.test.ts src/model/grid-model.test.ts src/view/wave-renderer.test.ts`

Expected: PASS. The old simulation tests should still pass because `simulateWave()` remains in place.

- [ ] **Step 3: Run full unit test suite**

Run: `node --run test:unit`

Expected: PASS.

- [ ] **Step 4: Run linter**

Run: `node --run lint`

Expected: PASS.

- [ ] **Step 5: Run production build**

Run: `node --run build`

Expected: PASS.

- [ ] **Step 6: Inspect git diff**

Run: `git diff -- src/wave src/model/grid-model.ts src/view/grid-view.ts src/level-session.ts src/tide-session.ts src/config.ts docs/gameplay.md docs/plans/2026-06-04-wave-segment-actor.md docs/plans/2026-06-04-wave-segment-actor-implementation.md`

Expected: diff only contains the wave actor implementation, gameplay docs update, and design/plan docs. Do not revert unrelated user changes.

---

## Notes for implementers

- The first actor runtime intentionally drops lateral spread. Do not reintroduce row settling in this milestone.
- `WaveSegment` should emit every event it experiences. Do not dedupe same-tile hits.
- `WaveEventApplier` owns immediate mutation so sessions do not grow more terrain-specific logic.
- If Excalibur action chaining differs from the mock, keep the state machine and event timing the same and adjust only the API syntax.
- If tests need Excalibur mocks, keep mocks local to the test file as existing `src/view/wave-renderer.test.ts` does.
