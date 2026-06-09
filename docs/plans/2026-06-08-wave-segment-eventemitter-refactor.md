# WaveSegment EventEmitter Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `WaveSegment`'s hand-rolled listener set and the `WaveSegmentEvent` discriminated-union type map with class-based event objects dispatched through Excalibur's native `EventEmitter`.

**Architecture:** Each wave event becomes its own class extending `ex.GameEvent<WaveSegment>` (e.g. `TileEnteredEvent`, `BlockedEvent`, `DissipatedEvent`). All events flow through a single `'wave'` channel on an `ex.EventEmitter`, so consumers subscribe once and discriminate with `instanceof` instead of a `type` string. This keeps the existing single-funnel dispatch shape in `WaveActorRuntime` (one handler sees every event in emit order) while removing the union type entirely, per the requirement to define events as classes rather than a big type map.

**Tech Stack:** TypeScript, Excalibur.js (`EventEmitter`, `GameEvent`, `Subscription`), Vitest (unit + browser projects).

---

## Design decisions

- **Single `'wave'` channel, polymorphic payload.** Excalibur's `EventEmitter<TEventMap>` keys handlers by event name. A per-event-name map (`{ tileentered: ..., blocked: ..., ... }`) would reintroduce exactly the "big type map" we're removing and force consumers to register seven handlers. Instead the map is `{ wave: WaveEvent }` and the payload is a polymorphic class instance. Dispatch stays synchronous and ordered, so the runtime's "see every event" funnel is preserved with one `.on('wave', ...)` subscription.
- **`instanceof` replaces `event.type`.** The two consumers (`WaveEventApplier.apply` and the `WaveActorRuntime` handler) switch on the class via `instanceof`.
- **Extend `ex.GameEvent<WaveSegment>`.** This is the idiomatic Excalibur base (verified at `node_modules/excalibur/build/dist/Events.d.ts:135`; no-arg constructor, settable `target`). We do not set `target` (events already carry `col`/`row`); standalone emitters don't auto-assign it.
- **Cleanup via `Subscription.close()`.** `.on()` returns a `Subscription` (verified at `node_modules/excalibur/build/dist/EventEmitter.d.ts`). This replaces the returned unsubscribe closure.

## Files touched

- Create: `src/wave/wave-events.ts` — event classes + `WaveSegmentEventMap`
- Create: `src/wave/wave-events.test.ts` — unit coverage for the event classes
- Modify: `src/wave/wave-segment-types.ts` — remove `WaveSegmentEvent` union; retype `events` arrays
- Modify: `src/wave/wave-segment.ts` — swap listener `Set` for `EventEmitter`, emit class instances
- Modify: `src/wave/wave-segment.browser.test.ts` — subscribe via `events.on('wave', ...)`, assert instances
- Modify: `src/wave/wave-event-applier.ts` — `instanceof` dispatch
- Modify: `src/wave/wave-event-applier.test.ts` — construct event instances
- Modify: `src/wave/wave-actor-runtime.ts` — subscribe via `EventEmitter`, store `Subscription`
- Modify: `src/wave/wave-actor-runtime.test.ts` — mock segment owns a real `EventEmitter`

Reference: code style (`for..of`, curly braces, return-early, DRY/YAGNI), testing rules (no stubbing the subject, partial matching, study existing tests). Run on the current branch only (no worktrees, per `AGENTS.md`).

---

## Task 1: Define event classes

**Files:**
- Create: `src/wave/wave-events.ts`
- Test: `src/wave/wave-events.test.ts`

**Step 1: Write the failing test**

`src/wave/wave-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AbsorbedEvent,
  BlockedEvent,
  CastleFloodedEvent,
  DissipatedEvent,
  OvertoppedEvent,
  TileCoveredEvent,
  TileEnteredEvent,
  WaveEvent,
} from './wave-events.ts';

describe('wave events', () => {
  it('carries grid coordinates and is a WaveEvent', () => {
    const event = new TileEnteredEvent(2, 3, 4, 0.85);
    expect(event).toBeInstanceOf(WaveEvent);
    expect(event).toMatchObject({ col: 2, row: 3, depth: 4, alpha: 0.85 });
  });

  it('absorbed events expose the absorbed depth', () => {
    const event = new AbsorbedEvent(1, 1, 5, 2, 0.7);
    expect(event).toMatchObject({ col: 1, row: 1, depth: 5, absorbedDepth: 2, alpha: 0.7 });
  });

  it('dissipated events carry only coordinates', () => {
    const event = new DissipatedEvent(0, 1);
    expect(event).toMatchObject({ col: 0, row: 1 });
  });

  it('events of different kinds are distinguishable by instanceof', () => {
    const events: WaveEvent[] = [
      new BlockedEvent(0, 0, 1, 0.5),
      new OvertoppedEvent(0, 0, 1, 0.5),
      new CastleFloodedEvent(0, 0, 1, 0.5),
      new TileCoveredEvent(0, 0, 1, 0.5),
    ];
    expect(events.filter((e) => e instanceof BlockedEvent)).toHaveLength(1);
    expect(events.filter((e) => e instanceof OvertoppedEvent)).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --run test:unit -- src/wave/wave-events.test.ts`
Expected: FAIL — cannot resolve `./wave-events.ts`.

**Step 3: Write minimal implementation**

`src/wave/wave-events.ts`:

```ts
import { GameEvent } from 'excalibur';
import type { WaveSegment } from './wave-segment.ts';

/** Base class for every event a WaveSegment emits. Carries the affected grid cell. */
export abstract class WaveEvent extends GameEvent<WaveSegment> {
  protected constructor(
    public readonly col: number,
    public readonly row: number,
  ) {
    super();
  }
}

export class TileEnteredEvent extends WaveEvent {
  constructor(
    col: number,
    row: number,
    public readonly depth: number,
    public readonly alpha: number,
  ) {
    super(col, row);
  }
}

export class TileCoveredEvent extends WaveEvent {
  constructor(
    col: number,
    row: number,
    public readonly depth: number,
    public readonly alpha: number,
  ) {
    super(col, row);
  }
}

export class BlockedEvent extends WaveEvent {
  constructor(
    col: number,
    row: number,
    public readonly depth: number,
    public readonly alpha: number,
  ) {
    super(col, row);
  }
}

export class OvertoppedEvent extends WaveEvent {
  constructor(
    col: number,
    row: number,
    public readonly depth: number,
    public readonly alpha: number,
  ) {
    super(col, row);
  }
}

export class CastleFloodedEvent extends WaveEvent {
  constructor(
    col: number,
    row: number,
    public readonly depth: number,
    public readonly alpha: number,
  ) {
    super(col, row);
  }
}

export class AbsorbedEvent extends WaveEvent {
  constructor(
    col: number,
    row: number,
    public readonly depth: number,
    public readonly absorbedDepth: number,
    public readonly alpha: number,
  ) {
    super(col, row);
  }
}

export class DissipatedEvent extends WaveEvent {
  constructor(col: number, row: number) {
    super(col, row);
  }
}

/** All WaveSegment events flow through one channel; discriminate with instanceof. */
export type WaveSegmentEventMap = {
  wave: WaveEvent;
};
```

**Step 4: Run test to verify it passes**

Run: `node --run test:unit -- src/wave/wave-events.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/wave/wave-events.ts src/wave/wave-events.test.ts
git commit -m "feat: add class-based wave event types"
```

---

## Task 2: Retype shared wave types

**Files:**
- Modify: `src/wave/wave-segment-types.ts:25-45`

The union `WaveSegmentEvent` (lines 25-32) is removed. Two interfaces reference it and must switch to `WaveEvent[]`.

**Step 1: Edit `src/wave/wave-segment-types.ts`**

Remove lines 25-32 (the `export type WaveSegmentEvent = ...` union). Add an import at the top:

```ts
import type { Tile } from '../view/tile.ts';
import type { WaveEvent } from './wave-events.ts';
```

Update `WaveActorRuntimeResult` (was lines 40-45) so `events` is typed as the base class:

```ts
export interface WaveActorRuntimeResult {
  castleFlooded: boolean;
  erodedTiles: Tile[];
  sandRedistributed: boolean;
  events: WaveEvent[];
}
```

`WaveEventApplyResult` (lines 34-38) is unchanged. `WaveSegmentSpawn`, `WaveSegmentGrid`, `WaveState` are unchanged.

**Step 2: Verify the typecheck now fails meaningfully**

Run: `node --run build`
Expected: FAIL — `wave-segment.ts`, `wave-event-applier.ts`, `wave-actor-runtime.ts` and their tests still import/use `WaveSegmentEvent`. This confirms the union is fully removed; the next tasks fix each site. (Do not commit yet — the tree does not typecheck.)

---

## Task 3: Emit class events from WaveSegment

**Files:**
- Modify: `src/wave/wave-segment.ts` (imports, lines 11, 38, 72-77, all `emitWaveEvent` call sites, 356-360)

**Step 1: Update imports and the emitter field**

Replace the type import block (lines 2-7) so `WaveSegmentEvent` is dropped and the event classes + map come in, and import `EventEmitter`:

```ts
import { Actor, CollisionType, EventEmitter, Vector, type Engine, type Sprite } from "excalibur";
import type {
  WaveSegmentGrid,
  WaveSegmentSpawn,
  WaveState,
} from "./wave-segment-types.ts";
import {
  AbsorbedEvent,
  BlockedEvent,
  CastleFloodedEvent,
  DissipatedEvent,
  OvertoppedEvent,
  TileCoveredEvent,
  TileEnteredEvent,
  type WaveSegmentEventMap,
} from "./wave-events.ts";
import { beachSpriteSheet } from "../resources.ts";
import { progressionAlpha } from "./water-alpha.ts";
```

Delete the `type WaveSegmentListener = ...` line (line 11).

Replace the `private readonly listeners = new Set<WaveSegmentListener>();` field (line 38) with:

```ts
readonly events = new EventEmitter<WaveSegmentEventMap>();
```

**Step 2: Remove the old subscribe/emit plumbing**

Delete `onWaveEvent` (lines 72-77) and `emitWaveEvent` (lines 356-360) entirely.

**Step 3: Replace every emit call site**

Convert each `this.emitWaveEvent({ type: "...", ... })` to `this.events.emit('wave', new XEvent(...))`. Concretely:

- `enterRow`, tileCovered (lines 164-171):
  ```ts
  this.events.emit('wave', new TileCoveredEvent(col, row - 1, previousCell.depth, previousCell.alpha));
  ```
- tileEntered (lines 173-179):
  ```ts
  this.events.emit('wave', new TileEnteredEvent(col, row, this.currentDepth, this.currentAlpha));
  ```
- castleFlooded (lines 182-188):
  ```ts
  this.events.emit('wave', new CastleFloodedEvent(col, row, this.currentDepth, this.currentAlpha));
  ```
- blocked (lines 196-202):
  ```ts
  this.events.emit('wave', new BlockedEvent(col, row, this.currentDepth, this.currentAlpha));
  ```
- overtopped (lines 208-214):
  ```ts
  this.events.emit('wave', new OvertoppedEvent(col, row, this.currentDepth, this.currentAlpha));
  ```
- absorbed (lines 223-230):
  ```ts
  this.events.emit('wave', new AbsorbedEvent(col, row, depthBeforeAbsorption, absorbedDepth, this.currentAlpha));
  ```
- dissipated, in `finishRecession` (lines 348-352):
  ```ts
  this.events.emit('wave', new DissipatedEvent(this.spawn.col, Math.max(this.lastEnteredRow, 0)));
  ```

**Step 4: Update the browser test**

`src/wave/wave-segment.browser.test.ts` — update imports and the subscribe helper, and rewrite assertions to use instances.

Imports (lines 5-9) become:

```ts
import {
  CastleFloodedEvent,
  TileCoveredEvent,
  TileEnteredEvent,
  WaveEvent,
} from "./wave-events.ts";
import type { WaveSegmentGrid, WaveSegmentSpawn } from "./wave-segment-types.ts";
```

`makeSegment` (lines 41-51) subscribes through the emitter:

```ts
async function makeSegment(
  ctx: ExcaliburBrowserTestContext,
  spawnInput: Partial<WaveSegmentSpawn> = {},
  gridInput: Partial<WaveSegmentGrid> = {},
): Promise<{ segment: WaveSegment; events: WaveEvent[] }> {
  const events: WaveEvent[] = [];
  const segment = new WaveSegment(spawn(spawnInput), grid(gridInput), 0.5);
  segment.events.on('wave', (event) => events.push(event));
  ctx.scene.add(segment);
  return { segment, events };
}
```

Rewrite the three event-array assertions to check instance type + fields instead of `toEqual({ type: ... })`. For "surges through rows" (lines 82-86):

```ts
expect(events).toHaveLength(3);
expect(events[0]).toBeInstanceOf(TileEnteredEvent);
expect(events[0]).toMatchObject({ col: 1, row: 0, depth: 4, alpha: 0.85 });
expect(events[1]).toBeInstanceOf(TileCoveredEvent);
expect(events[1]).toMatchObject({ col: 1, row: 0, depth: 4, alpha: 0.85 });
expect(events[2]).toBeInstanceOf(TileEnteredEvent);
expect(events[2]).toMatchObject({ col: 1, row: 1, depth: 3.5 });
```

For "blocked wave" (lines 100, 110): replace `toContainEqual({ type: "blocked", ... })` with a found-instance check, and the last-event dissipated check:

```ts
const blocked = events.find((e) => e instanceof BlockedEvent);
expect(blocked).toMatchObject({ col: 1, row: 0, depth: 2, alpha: 0.85 });
// ...
expect(events[events.length - 1]).toBeInstanceOf(DissipatedEvent);
expect(events[events.length - 1]).toMatchObject({ col: 1, row: 0 });
```

(Add `BlockedEvent`, `DissipatedEvent` to the import.)

For "castle entry" (lines 120-123):

```ts
expect(events).toHaveLength(2);
expect(events[0]).toBeInstanceOf(TileEnteredEvent);
expect(events[1]).toBeInstanceOf(CastleFloodedEvent);
expect(events[1]).toMatchObject({ col: 1, row: 0, depth: 4, alpha: 0.85 });
```

**Step 5: Run the segment browser test**

Run: `node --run test:browser -- src/wave/wave-segment.browser.test.ts`
Expected: PASS. (If the browser project name differs, list scripts with `node --run` and use the project that runs `*.browser.test.ts`; see `docs/testing.md`.)

Do not commit yet — `wave-event-applier.ts` and `wave-actor-runtime.ts` still reference the removed union, so `node --run build` will not pass until Tasks 4 and 5 land.

---

## Task 4: instanceof dispatch in WaveEventApplier

**Files:**
- Modify: `src/wave/wave-event-applier.ts:3, 11-44`
- Modify: `src/wave/wave-event-applier.test.ts`

**Step 1: Rewrite `apply` to use `instanceof`**

Replace the import (line 3) and method body:

```ts
import type { WaveEventApplyResult } from './wave-segment-types.ts';
import {
  AbsorbedEvent,
  BlockedEvent,
  CastleFloodedEvent,
  DissipatedEvent,
  OvertoppedEvent,
  TileCoveredEvent,
  type WaveEvent,
} from './wave-events.ts';
```

```ts
apply(event: WaveEvent): WaveEventApplyResult {
  const result: WaveEventApplyResult = {
    castleFlooded: false,
    erodedTile: null,
    sandRedistributed: false,
  };

  if (event instanceof DissipatedEvent) {
    return result;
  }

  if (event instanceof CastleFloodedEvent) {
    result.castleFlooded = true;
    return result;
  }

  if (event instanceof AbsorbedEvent) {
    this.grid.applyActorPuddleDelta(event.col, event.row, event.absorbedDepth);
    return result;
  }

  if (event instanceof BlockedEvent || event instanceof OvertoppedEvent) {
    result.sandRedistributed = this.grid.applyActorSandRedistribution(event.col, event.row);
    return result;
  }

  if (event instanceof TileCoveredEvent) {
    this.sandLayer?.coverCell(event.col, event.row);
    return result;
  }

  // Remaining case: TileEnteredEvent — counts toward erosion.
  if (event instanceof TileEnteredEvent) {
    result.erodedTile = this.grid.applyWaveWaterHit(event.col, event.row, event.depth);
  }
  return result;
}
```

Add `TileEnteredEvent` to the import. (The explicit final `instanceof` keeps `event.depth` well-typed without a cast and is exhaustive over the seven event classes.)

**Step 2: Update the applier test**

`src/wave/wave-event-applier.test.ts` — replace every `applier.apply({ type: '...', ... })` object literal with the matching class instance. Add the import:

```ts
import {
  AbsorbedEvent,
  BlockedEvent,
  CastleFloodedEvent,
  OvertoppedEvent,
  TileCoveredEvent,
  TileEnteredEvent,
} from './wave-events.ts';
```

Conversions (same args, same order as the class constructors):

- `{ type: 'absorbed', col: 1, row: 1, depth: 2, absorbedDepth: 2, alpha: 0.85 }` → `new AbsorbedEvent(1, 1, 2, 2, 0.85)`
- `{ type: 'absorbed', col: 1, row: 1, depth: 5, absorbedDepth: 1, alpha: 0.85 }` → `new AbsorbedEvent(1, 1, 5, 1, 0.85)`
- `{ type: 'tileEntered', col: 1, row: 1, depth: 5, alpha: 0.85 }` → `new TileEnteredEvent(1, 1, 5, 0.85)`
- `{ type: 'blocked', col: 1, row: 1, depth: 2, alpha: 0.85 }` → `new BlockedEvent(1, 1, 2, 0.85)`
- `{ type: 'overtopped', col: 1, row: 1, depth: 2, alpha: 0.7 }` → `new OvertoppedEvent(1, 1, 2, 0.7)`
- `{ type: 'blocked', col: 1, row: 1, depth: 6, alpha: 0.85 }` → `new BlockedEvent(1, 1, 6, 0.85)`
- `{ type: 'overtopped', col: 1, row: 1, depth: 6, alpha: 0.7 }` → `new OvertoppedEvent(1, 1, 6, 0.7)`
- `{ type: 'tileCovered', col: 2, row: 3, depth: 1, alpha: 0.5 }` → `new TileCoveredEvent(2, 3, 1, 0.5)`
- `{ type: 'tileCovered', col: 0, row: 0, depth: 1, alpha: 0.5 }` → `new TileCoveredEvent(0, 0, 1, 0.5)`
- `{ type: 'castleFlooded', col: 2, row: 2, depth: 3, alpha: 0.5 }` → `new CastleFloodedEvent(2, 2, 3, 0.5)`

Note: the test at lines 59-67 uses `vi.spyOn(grid, 'applyWaveWaterHit')` — this spies on the `grid` collaborator (a test double), not on the subject under test (`WaveEventApplier`), so it complies with the no-stubbing rule and stays as-is.

**Step 3: Run the applier test**

Run: `node --run test:unit -- src/wave/wave-event-applier.test.ts`
Expected: PASS.

---

## Task 5: Subscribe through EventEmitter in WaveActorRuntime

**Files:**
- Modify: `src/wave/wave-actor-runtime.ts:5, 16, 63-91, 105-110, 133-137`
- Modify: `src/wave/wave-actor-runtime.test.ts`

**Step 1: Update imports and the run state type**

Replace the import (line 5) and add `Subscription`:

```ts
import type { ImageSource, Scene, Subscription } from 'excalibur';
import { StaticWaterActor } from './static-water-actor.ts';
import type { WaveEventApplier } from './wave-event-applier.ts';
import { WaveSegment } from './wave-segment.ts';
import type { WaveActorRuntimeResult, WaveSegmentGrid, WaveSegmentSpawn } from './wave-segment-types.ts';
import { DissipatedEvent, TileCoveredEvent, type WaveEvent } from './wave-events.ts';
```

In `ActiveWaveRun` (lines 7-18) retype the two members that referenced the union:

```ts
  events: WaveEvent[];
  // ...
  unsubscribes: Map<WaveSegment, Subscription>;
```

**Step 2: Subscribe via the emitter**

Replace the subscription block (lines 63-91):

```ts
const subscription = segment.events.on('wave', event => {
  if (run.settled || (event instanceof DissipatedEvent && run.dissipatedSegments.has(segment))) {
    return;
  }

  run.events.push(event);

  if (event instanceof TileCoveredEvent) {
    this.addStaticWater(run, segment, event);
  }

  const applied = this.applier.apply(event);
  run.castleFlooded ||= applied.castleFlooded;
  run.sandRedistributed ||= applied.sandRedistributed;
  if (applied.erodedTile) {
    run.erodedTiles.push(applied.erodedTile);
  }

  if (event instanceof DissipatedEvent) {
    run.dissipatedSegments.add(segment);
    this.cleanupStaticWater(run, segment);
    run.unsubscribes.get(segment)?.close();
    run.unsubscribes.delete(segment);
    this.actors.delete(segment);
    run.remaining--;
    maybeResolve();
  }
});
run.unsubscribes.set(segment, subscription);
this.scene.add(segment);
```

**Step 3: Update cleanup and `addStaticWater` signature**

In `cleanup` (lines 105-110) change the unsubscribe loop to call `.close()`:

```ts
if (run) {
  for (const subscription of run.unsubscribes.values()) {
    subscription.close();
  }
  run.unsubscribes.clear();
}
```

In `addStaticWater` (line 136) change the param type from the `Extract<...>` to the class:

```ts
private addStaticWater(
  run: ActiveWaveRun,
  segment: WaveSegment,
  event: TileCoveredEvent,
): void {
```

**Step 4: Update the runtime test**

`src/wave/wave-actor-runtime.test.ts` — the mock `WaveSegment` (lines 5-32) should own a real `EventEmitter` instead of a hand-rolled listener set (avoids reimplementing dispatch in the test). Replace the mock and helpers:

```ts
import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'excalibur';
import { WaveActorRuntime } from './wave-actor-runtime.ts';
import type { WaveEventApplyResult, WaveSegmentGrid, WaveSegmentSpawn } from './wave-segment-types.ts';
import {
  BlockedEvent,
  CastleFloodedEvent,
  DissipatedEvent,
  TileCoveredEvent,
  TileEnteredEvent,
  type WaveEvent,
  type WaveSegmentEventMap,
} from './wave-events.ts';

vi.mock('./wave-segment.ts', () => {
  class WaveSegment {
    readonly events = new EventEmitter<WaveSegmentEventMap>();

    constructor(
      _spawn: WaveSegmentSpawn,
      public readonly grid: WaveSegmentGrid,
      public readonly terrainSlope: number,
    ) {}
  }

  return { WaveSegment };
});
```

Update the `MockWaveSegment` interface and `segment()` helper so emitting goes through the emitter:

```ts
interface MockWaveSegment {
  grid: WaveSegmentGrid;
  terrainSlope: number;
  events: EventEmitter<WaveSegmentEventMap>;
}

function segment(actor: unknown): MockWaveSegment {
  return actor as MockWaveSegment;
}

function emit(actor: unknown, event: WaveEvent): void {
  segment(actor).events.emit('wave', event);
}
```

Replace every `segment(added[i]).emit({ type: '...', ... })` with `emit(added[i], new XEvent(...))`, and every `applier.apply` predicate / event literal accordingly:

- `{ type: 'dissipated', col: 0, row: 1 }` → `new DissipatedEvent(0, 1)`
- `{ type: 'dissipated', col: 1, row: 1 }` → `new DissipatedEvent(1, 1)`
- `{ type: 'castleFlooded', col: 0, row: 2, depth: 2, alpha: 0.85 }` → `new CastleFloodedEvent(0, 2, 2, 0.85)`
- `{ type: 'blocked', col: 0, row: 2, depth: 1, alpha: 0.5 }` → `new BlockedEvent(0, 2, 1, 0.5)`
- `{ type: 'dissipated', col: 0, row: 2 }` → `new DissipatedEvent(0, 2)`
- `{ type: 'tileEntered', col: 0, row: 0, depth: 2, alpha: 0.85 }` → `new TileEnteredEvent(0, 0, 2, 0.85)`
- `{ type: 'castleFlooded', col: 0, row: 1, depth: 2, alpha: 0.85 }` → `new CastleFloodedEvent(0, 1, 2, 0.85)`
- `{ type: 'tileCovered', col: 3, row: 2, depth: 1.5, alpha: 0.4 }` → `new TileCoveredEvent(3, 2, 1.5, 0.4)`
- `{ type: 'dissipated', col: 3, row: 2 }` → `new DissipatedEvent(3, 2)`
- `{ type: 'tileCovered', col: 0, row: 1, depth: 2, alpha: 0.7 }` → `new TileCoveredEvent(0, 1, 2, 0.7)`

Update the two `applier.apply` mock predicates that branch on `event.type`:

- `castleFlooded: event.type === 'castleFlooded'` → `castleFlooded: event instanceof CastleFloodedEvent`
- `erodedTile: event.type === 'blocked' ? ... : null` → `erodedTile: event instanceof BlockedEvent ? (erodedTile as never) : null`
- `sandRedistributed: event.type === 'blocked'` → `sandRedistributed: event instanceof BlockedEvent`

The two `await expect(promise).resolves.toEqual({ ..., events: [firstEvent, secondEvent] })` assertions still work — store the constructed instances in locals (e.g. `const firstEvent = new DissipatedEvent(0, 1)`) and reuse them, exactly as the current test reuses its literals.

The first test (lines 126-129) asserts `segment(added[0]).grid` and `.terrainSlope` — these remain valid since the mock still exposes those fields.

**Step 5: Run the runtime test**

Run: `node --run test:unit -- src/wave/wave-actor-runtime.test.ts`
Expected: PASS.

---

## Task 6: Full verification and commit

**Step 1: Lint**

Run: `node --run lint`
Expected: PASS (no unused imports — confirm `WaveSegmentEvent` no longer appears anywhere: `grep -rn "WaveSegmentEvent\b" src` should return nothing; `WaveSegmentEventMap` is the only remaining match).

**Step 2: Typecheck + build**

Run: `node --run build`
Expected: PASS — the union is gone and every consumer compiles against the event classes.

**Step 3: Unit tests**

Run: `node --run test:unit`
Expected: PASS.

**Step 4: Browser tests**

Run the browser project (the one that executes `*.browser.test.ts`; see `docs/testing.md`).
Expected: PASS — `wave-segment.browser.test.ts` and `static-water-actor.browser.test.ts` green.

**Step 5: Commit**

```bash
git add src/wave/
git commit -m "refactor: dispatch wave segment events via Excalibur EventEmitter"
```

---

## Verification summary

Every task ends green before moving on. Final gate: `node --run lint`, `node --run build`, `node --run test:unit`, and the browser test project all pass, with no remaining references to the `WaveSegmentEvent` union.

## Out of scope

- No behavior change to wave physics, ordering, or timing — dispatch stays synchronous and ordered.
- No migration of other callback patterns (cleanup callbacks, toolbar/digging callbacks, React props). See `docs/plans/2026-06-08-eventing-excalibur-migration-design.md` for why those stay as-is.
- No new wave-level aggregator bus / `pipe()` (YAGNI until a second consumer exists).
