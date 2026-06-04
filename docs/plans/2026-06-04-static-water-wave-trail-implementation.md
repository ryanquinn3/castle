# Static Water Wave Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sprite-based static water actors that remain in wave-visited cells until their owning `WaveSegment` physically recedes into them.

**Architecture:** `WaveSegment` remains the moving gameplay actor. `StaticWaterActor` is a visual-only actor spawned by `WaveActorRuntime` on `tileEntered`; it listens for passive collision with its owning receding segment, then fades/kills itself. Runtime owns all static water actors for cleanup.

**Tech Stack:** TypeScript, Excalibur 0.32 actors/collision events, Vitest, Vite.

**Execution Note:** Do not commit during this plan unless the user explicitly asks. Use tests and diffs as checkpoints instead.

---

## File Structure

- Create `src/wave/static-water-actor.ts`: actor class for fixed water sprites, sprite selection, collision-driven removal, direct cleanup.
- Create `src/wave/static-water-actor.test.ts`: unit tests for collision gating, owner checks, sprite selection, cleanup idempotence.
- Modify `src/wave/wave-segment.ts`: opt moving wave segments into passive collision and keep them above static water.
- Modify `src/wave/wave-segment.test.ts`: extend Excalibur mock and assert passive collision config.
- Modify `src/wave/wave-actor-runtime.ts`: create static water actors on `tileEntered`, track them by segment, clean them on dissipate and cleanup.
- Modify `src/wave/wave-actor-runtime.test.ts`: mock `StaticWaterActor`, assert creation and cleanup.
- Modify `src/level-session.ts` and `src/tide-session.ts`: pass `Resources.BeachTileset` to `WaveActorRuntime`.

## Task 1: StaticWaterActor

**Files:**
- Create: `src/wave/static-water-actor.ts`
- Create: `src/wave/static-water-actor.test.ts`

- [ ] **Step 1: Write failing tests for static water behavior**

Create `src/wave/static-water-actor.test.ts` with tests like:

```ts
import { describe, expect, it, vi } from 'vitest';
import { StaticWaterActor } from './static-water-actor.ts';

vi.mock('excalibur', () => {
  class Vector {
    constructor(public x: number, public y: number) {}
  }

  class Actor {
    pos: Vector;
    width: number;
    height: number;
    z: number | undefined;
    name: string | undefined;
    body = { collisionType: undefined as unknown };
    graphics = { use: vi.fn<(graphic: unknown) => void>() };
    private handlers = new Map<string, (event: unknown) => void>();
    actions = {
      fade: vi.fn<(opacity: number, duration: number) => { callMethod(callback: () => void): void }>(() => ({
        callMethod: (callback: () => void) => callback(),
      })),
    };

    constructor(options: { pos: Vector; width: number; height: number; z?: number; name?: string; collisionType?: unknown }) {
      this.pos = options.pos;
      this.width = options.width;
      this.height = options.height;
      this.z = options.z;
      this.name = options.name;
      this.body.collisionType = options.collisionType;
    }

    on(eventName: string, handler: (event: unknown) => void): void {
      this.handlers.set(eventName, handler);
    }

    emitCollision(otherOwner: unknown): void {
      this.handlers.get('collisionstart')?.({ other: { owner: otherOwner } });
    }

    kill = vi.fn<() => void>();
  }

  return {
    Actor,
    CollisionType: { Passive: 'passive' },
    SpriteSheet: {
      fromImageSource: vi.fn(() => ({
        getSprite: vi.fn((col: number, row: number) => `sprite-${col}-${row}`),
      })),
    },
    Vector,
  };
});

interface MockSegment {
  state: 'surging' | 'crashing' | 'receding' | 'dead';
}

function actor(segment: MockSegment = { state: 'surging' }, input: Partial<ConstructorParameters<typeof StaticWaterActor>[0]> = {}) {
  return new StaticWaterActor({
    col: 2,
    row: 3,
    x: 40,
    y: 56,
    tileSize: 16,
    depth: 4,
    owner: segment as never,
    image: {} as never,
    ...input,
  });
}

describe('StaticWaterActor', () => {
  it('uses a deterministic beach tileset water sprite', () => {
    const water = actor(undefined, { col: 5, row: 7 });

    expect(water.graphics.use).toHaveBeenCalledWith('sprite-6-0');
    expect(water.col).toBe(5);
    expect(water.row).toBe(7);
    expect(water.depth).toBe(4);
  });

  it('ignores its owner while the segment is still surging', () => {
    const segment: MockSegment = { state: 'surging' };
    const water = actor(segment);

    water.emitCollision(segment);

    expect(water.kill).not.toHaveBeenCalled();
  });

  it('removes itself when its owning segment recedes into it', () => {
    const segment: MockSegment = { state: 'receding' };
    const water = actor(segment);

    water.emitCollision(segment);

    expect(water.kill).toHaveBeenCalledTimes(1);
  });

  it('ignores receding non-owner segments', () => {
    const owner: MockSegment = { state: 'receding' };
    const other: MockSegment = { state: 'receding' };
    const water = actor(owner);

    water.emitCollision(other);

    expect(water.kill).not.toHaveBeenCalled();
  });

  it('cleanup removes immediately and is idempotent', () => {
    const water = actor();

    water.cleanup();
    water.cleanup();

    expect(water.kill).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --run test:unit -- src/wave/static-water-actor.test.ts`

Expected: FAIL because `src/wave/static-water-actor.ts` does not exist.

- [ ] **Step 3: Implement StaticWaterActor**

Create `src/wave/static-water-actor.ts`:

```ts
import { Actor, CollisionType, SpriteSheet, Vector, type ImageSource } from 'excalibur';
import type { WaveSegment } from './wave-segment.ts';

const BEACH_TILE_SIZE = 16;
const BEACH_TILESET_COLS = 12;
const BEACH_TILESET_ROWS = 10;
const STATIC_WATER_Z = 6;
const FADE_MS = 120;
const WATER_SPRITES = [
  { col: 5, row: 0 },
  { col: 6, row: 0 },
  { col: 5, row: 1 },
  { col: 6, row: 1 },
] as const;

export interface StaticWaterActorConfig {
  col: number;
  row: number;
  x: number;
  y: number;
  tileSize: number;
  depth: number;
  owner: WaveSegment;
  image: ImageSource;
}

type CollisionStartLike = { other: { owner?: unknown } };

let waterSpriteSheet: SpriteSheet | null = null;

function getWaterSpriteSheet(image: ImageSource): SpriteSheet {
  waterSpriteSheet ??= SpriteSheet.fromImageSource({
    image,
    grid: {
      rows: BEACH_TILESET_ROWS,
      columns: BEACH_TILESET_COLS,
      spriteWidth: BEACH_TILE_SIZE,
      spriteHeight: BEACH_TILE_SIZE,
    },
  });
  return waterSpriteSheet;
}

function waterSpriteFor(col: number, row: number) {
  return WATER_SPRITES[Math.abs(col * 31 + row * 17) % WATER_SPRITES.length];
}

export class StaticWaterActor extends Actor {
  readonly col: number;
  readonly row: number;
  readonly depth: number;
  private readonly ownerSegment: WaveSegment;
  private removing = false;

  constructor(config: StaticWaterActorConfig) {
    super({
      pos: new Vector(config.x, config.y),
      width: Math.max(4, config.tileSize - 1),
      height: Math.max(4, config.tileSize - 1),
      collisionType: CollisionType.Passive,
      z: STATIC_WATER_Z,
      name: 'StaticWater',
    });

    this.col = config.col;
    this.row = config.row;
    this.depth = config.depth;
    this.ownerSegment = config.owner;

    const sprite = waterSpriteFor(config.col, config.row);
    const graphic = getWaterSpriteSheet(config.image).getSprite(sprite.col, sprite.row);
    if (graphic) {
      this.graphics.use(graphic);
    }

    this.on('collisionstart', (event) => this.handleCollision(event as CollisionStartLike));
  }

  cleanup(): void {
    if (this.removing) {
      return;
    }
    this.removing = true;
    this.kill();
  }

  private handleCollision(event: CollisionStartLike): void {
    if (event.other.owner !== this.ownerSegment || this.ownerSegment.state !== 'receding') {
      return;
    }
    this.removeByRecede();
  }

  private removeByRecede(): void {
    if (this.removing) {
      return;
    }
    this.removing = true;
    this.actions.fade(0, FADE_MS).callMethod(() => this.kill());
  }
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --run test:unit -- src/wave/static-water-actor.test.ts`

Expected: PASS.

## Task 2: Wave Segment Collision Config

**Files:**
- Modify: `src/wave/wave-segment.ts`
- Modify: `src/wave/wave-segment.test.ts`

- [ ] **Step 1: Write failing test for passive wave segment collision**

In `src/wave/wave-segment.test.ts`, update the Excalibur mock constructor options to accept optional `collisionType` and `z`, return `CollisionType: { Passive: 'passive' }`, and add this test:

```ts
it('participates in passive collisions for static water cleanup', () => {
  const segment = new WaveSegment(spawn(), grid(), 0.5);

  expect(controllable(segment).body.collisionType).toBe('passive');
  expect(controllable(segment).z).toBe(7);
});
```

Also extend `ControllableWaveSegment` in the test with:

```ts
body: { collisionType: unknown };
z: number | undefined;
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --run test:unit -- src/wave/wave-segment.test.ts`

Expected: FAIL because `WaveSegment` does not set passive collision config yet.

- [ ] **Step 3: Implement passive collision config**

In `src/wave/wave-segment.ts`, change the import and constructor options:

```ts
import { Actor, CollisionType, Color, Vector, type Engine } from 'excalibur';
```

Add to `super({ ... })`:

```ts
collisionType: CollisionType.Passive,
z: 7,
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --run test:unit -- src/wave/wave-segment.test.ts`

Expected: PASS.

## Task 3: Runtime Static Water Integration

**Files:**
- Modify: `src/wave/wave-actor-runtime.ts`
- Modify: `src/wave/wave-actor-runtime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

In `src/wave/wave-actor-runtime.test.ts`, mock `StaticWaterActor` after the `WaveSegment` mock:

```ts
vi.mock('./static-water-actor.ts', () => {
  class StaticWaterActor {
    cleaned = false;

    constructor(public readonly config: unknown) {}

    cleanup(): void {
      this.cleaned = true;
    }
  }

  return { StaticWaterActor };
});
```

Add helper:

```ts
interface MockStaticWaterActor {
  config: {
    col: number;
    row: number;
    x: number;
    y: number;
    tileSize: number;
    depth: number;
    owner: MockWaveSegment;
    image: unknown;
  };
  cleaned: boolean;
}

function staticWater(actor: unknown): MockStaticWaterActor {
  return actor as MockStaticWaterActor;
}
```

Update runtime constructor calls in this test file to pass a fifth image argument, e.g. `const image = {}; new WaveActorRuntime(scene as never, runtimeGrid, applier as never, 0.5, image as never);`.

Add this test:

```ts
it('creates static water on tileEntered and cleans it on segment dissipated', async () => {
  const added: unknown[] = [];
  const scene = {
    add: vi.fn<(actor: unknown) => void>(actor => {
      added.push(actor);
    }),
    remove: vi.fn<(actor: unknown) => void>(),
  };
  const applier = {
    apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(() => ({
      castleFlooded: false,
      erodedTile: null,
      sandRedistributed: false,
    })),
  };
  const image = {};
  const runtimeGrid = grid();
  const runtime = new WaveActorRuntime(scene as never, runtimeGrid, applier as never, 0.5, image as never);

  const promise = runtime.playWave([spawn({ col: 3, x: 56 })]);
  const movingSegment = segment(added[0]);
  movingSegment.emit({ type: 'tileEntered', col: 3, row: 2, depth: 1.5 });

  expect(scene.add).toHaveBeenCalledTimes(2);
  const water = staticWater(added[1]);
  expect(water.config).toMatchObject({
    col: 3,
    row: 2,
    x: 56,
    y: 40,
    tileSize: 16,
    depth: 1.5,
    owner: movingSegment,
    image,
  });

  movingSegment.emit({ type: 'dissipated', col: 3, row: 2 });
  await promise;
  expect(water.cleaned).toBe(true);
});
```

Add this test:

```ts
it('cleanup removes active static water actors', async () => {
  const added: unknown[] = [];
  const scene = {
    add: vi.fn<(actor: unknown) => void>(actor => {
      added.push(actor);
    }),
    remove: vi.fn<(actor: unknown) => void>(),
  };
  const applier = {
    apply: vi.fn<(_: WaveSegmentEvent) => WaveEventApplyResult>(() => ({
      castleFlooded: false,
      erodedTile: null,
      sandRedistributed: false,
    })),
  };
  const runtime = new WaveActorRuntime(scene as never, grid(), applier as never, 0.5, {} as never);

  const promise = runtime.playWave([spawn()]);
  segment(added[0]).emit({ type: 'tileEntered', col: 0, row: 1, depth: 2 });
  const water = staticWater(added[1]);

  runtime.cleanup();
  await promise;

  expect(water.cleaned).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --run test:unit -- src/wave/wave-actor-runtime.test.ts`

Expected: FAIL because runtime does not construct static water and constructor lacks the image parameter.

- [ ] **Step 3: Implement runtime integration**

In `src/wave/wave-actor-runtime.ts`, import the image type and actor:

```ts
import type { ImageSource, Scene } from 'excalibur';
import { StaticWaterActor } from './static-water-actor.ts';
```

Add static water tracking to `ActiveWaveRun`:

```ts
staticWaterBySegment: Map<WaveSegment, Set<StaticWaterActor>>;
```

Add constructor parameter after `terrainSlope`:

```ts
private readonly waterImage: ImageSource,
```

Initialize in `run`:

```ts
staticWaterBySegment: new Map(),
```

Inside the segment listener, after `run.events.push(event);` and before applying the event, add:

```ts
if (event.type === 'tileEntered') {
  this.addStaticWater(run, segment, event);
}
```

Before deleting a dissipated segment, clean its static water:

```ts
this.cleanupStaticWater(run, segment);
```

In `cleanup()`, before removing active actors, clean all static water:

```ts
if (run) {
  for (const segment of run.staticWaterBySegment.keys()) {
    this.cleanupStaticWater(run, segment);
  }
}
```

Add private helpers:

```ts
private addStaticWater(
  run: ActiveWaveRun,
  segment: WaveSegment,
  event: Extract<WaveSegmentEvent, { type: 'tileEntered' }>,
): void {
  const water = new StaticWaterActor({
    col: event.col,
    row: event.row,
    x: segment.spawn.x,
    y: this.grid.gridTop + event.row * this.grid.tileSize + this.grid.tileSize / 2,
    tileSize: this.grid.tileSize,
    depth: event.depth,
    owner: segment,
    image: this.waterImage,
  });
  let waterForSegment = run.staticWaterBySegment.get(segment);
  if (!waterForSegment) {
    waterForSegment = new Set();
    run.staticWaterBySegment.set(segment, waterForSegment);
  }
  waterForSegment.add(water);
  this.scene.add(water);
}

private cleanupStaticWater(run: ActiveWaveRun, segment: WaveSegment): void {
  const waterForSegment = run.staticWaterBySegment.get(segment);
  if (!waterForSegment) {
    return;
  }
  for (const water of waterForSegment) {
    water.cleanup();
  }
  waterForSegment.clear();
  run.staticWaterBySegment.delete(segment);
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --run test:unit -- src/wave/wave-actor-runtime.test.ts`

Expected: PASS.

## Task 4: Session Wiring and Verification

**Files:**
- Modify: `src/level-session.ts`
- Modify: `src/tide-session.ts`

- [x] **Step 1: Write failing compile check expectation**

Run: `node --run build`

Expected: FAIL because `WaveActorRuntime` constructor calls in sessions are missing the new `Resources.BeachTileset` argument.

- [x] **Step 2: Pass beach tileset resource to runtime**

In `src/level-session.ts`, update the runtime constructor call:

```ts
this.waveRuntime = new WaveActorRuntime(
  this,
  this.makeWaveGridAdapter(),
  new WaveEventApplier(this.grid),
  TERRAIN_SLOPE,
  Resources.BeachTileset,
);
```

In `src/tide-session.ts`, update the runtime constructor call:

```ts
this.waveRuntime = new WaveActorRuntime(
  this,
  this.makeWaveGridAdapter(),
  new WaveEventApplier(this.grid),
  TERRAIN_SLOPE,
  Resources.BeachTileset,
);
```

- [x] **Step 3: Run focused unit tests**

Run: `node --run test:unit -- src/wave/static-water-actor.test.ts src/wave/wave-segment.test.ts src/wave/wave-actor-runtime.test.ts`

Expected: PASS.

- [x] **Step 4: Run full verification**

Run: `node --run test:unit`

Expected: PASS.

Run: `node --run build`

Expected: PASS.

- [ ] **Step 5: Review diff**

Run: `git diff -- docs/plans/2026-06-04-static-water-wave-trail.md docs/plans/2026-06-04-static-water-wave-trail-implementation.md src/wave/static-water-actor.ts src/wave/static-water-actor.test.ts src/wave/wave-segment.ts src/wave/wave-segment.test.ts src/wave/wave-actor-runtime.ts src/wave/wave-actor-runtime.test.ts src/level-session.ts src/tide-session.ts`

Expected: Diff only contains the static water trail implementation, tests, and plan/spec updates.

## Self-Review

- Spec coverage: actor-based static water, beach tileset sprites, passive collision removal, owner/receding guard, runtime cleanup, session resource wiring, and tests are covered.
- Placeholder scan: no TODO/TBD/implement-later placeholders.
- Type consistency: `StaticWaterActorConfig`, `WaveSegment.state`, `WaveActorRuntime` constructor, and runtime helper signatures are consistent across tasks.
