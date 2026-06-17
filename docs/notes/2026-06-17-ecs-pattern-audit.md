# ECS pattern audit — where we under- (and over-) use Excalibur's ECS

Date: 2026-06-17
Status: research / second opinion. No code changes proposed here, just findings.

## Question

Two framings the user asked for:

1. Where *should* we be leaning on ECS (entities / components / systems) but currently aren't?
2. Would any part of the game be *simpler* if we modeled it with ECS instead of the
   plain OOP/Actor approach we have today?

## TL;DR opinion

- The water simulation is the only real ECS in the codebase, and it is the *right*
  call there — but understand that its entity layer is a thin shell around a pure
  array solver, not per-entity system logic. Don't extend the water path expecting
  per-entity systems to pay off; they won't.
- The single highest-value ECS opportunity is **terrain**. Today it is a deep OOP
  class hierarchy whose mutation contract forces actor swap-in/swap-out and spreads
  `instanceof` type-dispatch across `GridModel`. Modeling a cell as a stable entity
  with composed components (Elevation / Wall / Hole / Tower / Erodible) removes both
  problems. This is the "would it be simpler" win.
- The cleanest low-risk win is a **lifespan/expiry component+system** for ephemeral
  actors (erosion flash, transient labels, banners). Small, idiomatic, removes
  hand-rolled `delay()`-and-cleanup bookkeeping.
- A few things look like ECS candidates but are **not** — session phase flags, the
  sand moist-layer, and pool detection. Calling those out so we don't over-correct.

---

## What ECS we have today

Only the wave runtime uses Excalibur ECS primitives:

- `WaterComponent` (`src/wave/water-component.ts`) — pure data: `col,row,depth,vel,floor`.
- `WaterCell` (`src/wave/water-cell.ts`) — a thin `Actor` that carries one
  `WaterComponent` and nothing else (no collider, no graphics).
- `WaveDynamicSystem` (`src/wave/wave-dynamic-system.ts`) — `extends System`,
  `SystemType.Update`, `priority -1`. Drives the sim.
- `WaveRenderSystem` (`src/wave/wave-render-system.ts`) — `extends System`, reads the
  same query, draws into the overlay.

Everything else — terrain, grid, sessions, planning, HUD, sand layer, castle,
erosion flash — is plain OOP `Actor` subclasses or stateful service classes with
manual per-frame/per-event updates.

### Important nuance: the water sim is not really "ECS per-entity logic"

`WaveDynamicSystem.update()` (`wave-dynamic-system.ts:273`) does this each tick:

1. `readCells()` — drain every `WaterComponent` into a plain `WetCell[]` array.
2. `computeFluxStep(...)` — a **pure global field solver** over that array
   (`wave-dynamic-system.ts:73`). It needs all-neighbor access, so it can't be
   expressed as independent per-entity iteration.
3. `reconcile(cells)` — diff the result against live actors: update matched cells,
   spawn `WaterCell`s for newly-wet cells, `kill()` drained ones
   (`wave-dynamic-system.ts:378`).

So the entity/component layer is essentially **storage + render plumbing** around a
pure array simulation. That is a legitimate pattern, but note the cost: as water
sloshes, cells are killed and re-spawned every step (the doc comment on
`WaterFieldEvents` even warns `WaterCellAdded` can fire repeatedly for the same
cell). The entities exist mainly so `WaveRenderSystem` can `world.query` them and so
Excalibur owns add/remove.

**Second opinion:** this is fine, but it is closer to "ECS as a rendering registry"
than "ECS as the simulation model." If we ever profile spawn/kill churn as a hotspot,
the honest move would be *fewer* entities (one persistent overlay reading the plain
grid), not more. Do not treat the water module as the template for ECS-ifying the
rest of the game.

---

## Candidate 1 (strongest): terrain as entity + composed components

### What's there now

`Terrain` (`src/model/terrain/terrain.ts:80`) is an abstract `Actor` with four
subclasses: `FlatGround`, `Hole`, `Wall`, `Tower`. Type-specific state lives as
fields on the subclass (`Wall.level/hp`, `Hole.depth/puddleDepth/hitCount`,
`Tower.towerHeight/hitCount`). Behavior is abstract methods: `elevation`,
`applyHits`, `applyDelta`, `resetHits`, `serialize`, `getRenderInfo`, `describe`.

Two structural smells fall out of this:

**a) Mutation swaps the actor.** `applyDelta` returns a *new* `Terrain` instance when
a cell changes type (`FlatGround.applyDelta` returns `new Hole(...)`,
flat-ground.ts:30; `Hole.applyDelta` can return `new FlatGround()`, hole.ts:51).
`GridModel.setCell` (grid-model.ts:125) then has to `scene.remove(prev)` and
`scene.add(next)`. Every type transition destroys and recreates a scene Actor and
re-attaches neighbors. Identity is not stable across a cell's lifetime.

**b) `instanceof` type-dispatch is sprayed across `GridModel`.** Roughly 14 sites in
`grid-model.ts` branch on the concrete terrain class:
`getPuddleDepth`/`getPuddleDepths`/`effectiveHoleDepth`/`getHitCount`/
`incrementHitCount` gate on `instanceof Hole`/`Tower`; `placeWall`/`placeTower`/
`clearCell` gate on `instanceof FlatGround`/`Wall`; `applyErosionHits`/
`commitHoleWave`/`applySandRedistributionAt`/`detectPools` branch on
`instanceof Hole`/`Wall`. `connectsTo` in `wall.ts:113` and `tower.ts:56` also
`instanceof`-checks. Scattered `instanceof` dispatch is the canonical signal that
behavior wants to live in composed components, not a class taxonomy.

### What ECS would change

Model a grid cell as **one stable entity** that carries:

- `ElevationComponent` (always) — the blocking height every consumer reads.
- `WallComponent { level, hp }` / `HoleComponent { depth, puddleDepth }` /
  `TowerComponent { hits }` — present only when the cell is that type.
- a `ErodibleTag` (walls + towers) so the erosion path queries
  `[ErodibleComponent]` instead of `instanceof Wall || instanceof Tower`.

Then:

- **Type change becomes add/remove component, not swap actor.** flat→wall is
  `addComponent(WallComponent)`; wall destroyed is `removeComponent(WallComponent)`.
  The cell entity, its transform, and its neighbor wiring never move. `setCell`'s
  remove/add dance and the "applyDelta returns a new instance" contract both go away.
- **`instanceof` checks become `entity.get(HoleComponent)` / `query([...])`.** The
  hole-specific operations (`getPuddleDepth`, `effectiveHoleDepth`, `commitHoleWave`)
  read a component or no-op when it's absent. Wall/tower erosion targets the
  `ErodibleTag` query.

### Honest counterpoint

Terrain is a **static grid** — cells never move and only change on player edits or
erosion events, not every frame. So this is *not* an argument for adding a per-frame
terrain System (that would iterate the whole board every tick for nothing). The win
is purely **composition + stable identity**: kill the actor-swap and the `instanceof`
sprawl. If anything, pool detection / puddle commit could become event-driven systems
that run only when a `HoleComponent` mutates, not on a frame cadence.

Effort: medium-high (touches every terrain subclass, `GridModel`, serialization, and
the render path). Payoff: removes the most-duplicated pattern in the model layer and
the awkward instance-swap. This is the one I'd actually plan out.

---

## Candidate 2 (cleanest win): lifespan/expiry component for ephemeral actors

Several places hand-roll "spawn actor, wait, remove actor":

- `flashErodedTiles` (`src/view/erosion-flash.ts:7`) — builds an `Actor` per eroded
  tile into a local array, `await delay(350)`, then loops `scene.remove`.
- `level-session.ts` transient-actor `Set` with a manual cleanup loop, and the
  elevation-label actor array toggled on a key hold.
- `tide-session.ts` mirrors the same transient-actor tracking.
- planning-phase reach-line / reach-label actors.

Each of these reinvents lifetime management. The idiomatic ECS shape is a
`LifespanComponent { remainingMs }` plus one `System` that decrements it and calls
`entity.kill()` at zero — spawn-and-forget, no local arrays, no `delay()` coupling,
and teardown is automatic if a wave is interrupted (today an interrupted wave can
strand a flash actor because the cleanup loop never runs).

Effort: low. Payoff: removes duplicated bookkeeping and a real interruption bug class.
Good first ECS adoption beyond the water module.

---

## Candidate 3 (marginal): selection / highlight as component state

`TerrainEditor` (`src/view/terrain-editor.ts`) keeps `selected`/`hovered` cells and
two highlight actors whose position+visibility are pushed imperatively in
`updateHighlight`/`updateHoverHighlight`. This *could* be a `SelectedTag`/`HoveredTag`
on the cell entity plus a system that positions the highlight from whatever entity
carries the tag.

Verdict: only worth it **if** Candidate 1 lands and cells are already entities.
Standalone it is lateral movement, not a simplification. File under "do it as a
follow-on, not on its own."

---

## Not ECS candidates (so we don't over-correct)

- **Session phase/state flags.** `tide-session.ts` has `wavePhaseRunning`,
  `gameOverActive`, `exitDialogOpen`, `deleteDialogOpen` plus a countdown. That is a
  scene-level **finite state machine**, not a population of homogeneous entities.
  ECS is the wrong hammer; an explicit FSM (or keeping the booleans) is clearer.
- **Sand moist layer.** `SandLayer` (`src/view/sand-layer.ts`) is a single composited
  canvas overlay with a 2D `states` array and a `dirty` flag. The whole point is one
  blurred/thresholded mask drawn in one pass; per-cell entities would fight the
  rendering approach and buy nothing.
- **Pool detection.** `GridModel.detectPools` (grid-model.ts:403) is a connected-
  components flood fill. It is a graph algorithm over the grid, not entity behavior.
  (It *would* benefit indirectly from Candidate 1 only in that it could query
  `[HoleComponent]` instead of `instanceof Hole`.)

---

## Worked example: animated damage indicator (HP bar over a damaged cell)

Follow-up question (2026-06-17): replace the post-wave erosion *flash* with a small
per-cell bar that animates a decrease when a wall loses HP or a hole silts. Is ECS a
good fit?

### Aside: are systems "completely independent"?

No — that framing is half-right and the correct half is what makes this feature
clean. Systems are decoupled **in code** (no system calls another) but coupled
through **shared component data** and **run order** (Excalibur orders by
`System.priority`; that's why `WaveDynamicSystem` is `priority -1` so it writes
before the render system reads). A damage-bar system reacting to erosion is the
sanctioned pattern: the erosion path *writes* component data, the bar system *reads*
it and animates. They never touch each other — coordination is through data.

### Verdict: yes, one of the better ECS fits in the game

Better than the water sim, in fact, because:

- Each damaged cell animates **independently** — no global neighbor coupling (the
  exact reason the water flux step couldn't be a real per-entity system; this one
  genuinely can).
- Behavior is **homogeneous** — every damaged cell animates the same way.
- Waves erode cells in **bursts** → "advance N entities identically each tick" is
  what systems are for.

Key enabler: terrain cells **already** `extend Actor` (`terrain.ts:80`), so a cell is
already an entity. This is adding a component to an existing entity, not building
entity identity.

### Shape

Animation state lives in data:

```ts
class DamageIndicatorComponent extends Component {
  displayedValue: number;   // what the bar currently shows
  targetValue: number;      // where it's heading (current hp / depth)
  maxValue: number;         // bar full-width reference
  idleMs = 0;               // time since last change, for fade-out
}
```

One system queries `[DamageIndicatorComponent]`, lerps `displayedValue → targetValue`
each fixed tick, updates the bar child graphic, and removes the component (or kills
the bar child) once settled and `idleMs` exceeds a fade timeout.

The win over today's flash: **re-damage just resets `targetValue`.** A second hit
mid-animation retargets and keeps lerping — no timer juggling, no stacked flashes.
The current `flashErodedTiles` (`erosion-flash.ts`) can't do this: fixed
`await delay(350)` + manual cleanup that leaks if a wave is interrupted.

### Trigger point (already exists)

Erosion flow: `WaveEventApplier` emits `eroded` → `GridModel.applyErosionHits`
(grid-model.ts:295) returns `newElevation`; `WaveFieldRuntime` collects `erodedTiles`.
Holes silt via `commitHoleWave`. At the apply point the cell *and* its new value
(`Wall.hp`, `Hole.depth`) are in hand — stamp/update the `DamageIndicatorComponent`
there, **during** the wave at the moment of the hit, instead of the post-wave batch
flash.

### Honest alternative (don't reach for the system reflexively)

Excalibur has two built-ins that animate-then-remove without authoring a system:

- **Child actor + Actions** — `cell.addChild(bar)`, `bar.actions.fade(0, 400)...`.
  Fire-and-forget.
- **Coroutine** — `ex.coroutine(engine, function*(){ elapsed += yield 1; ... })` with
  `EasingFunctions` for a hand-tuned lerp (this is the pattern in Excalibur's own
  squash/stretch docs).

When to pick which: for a single fire-and-forget flash replacement, child actor +
coroutine is *less machinery* — start there. Choose the component+system when you
want (a) retarget-on-re-hit, (b) the animation pinned to the sim's fixed clock for
determinism, or (c) many bars at once under uniform fade-out rules. Because HP can
drop several times per wave, the system edges it out here — but it's a judgment call,
not a slam dunk.

This is the same family as Candidate 2 (a transient, time-evolving visual tied to a
cell), so the two would share a lifespan/fade mechanism if both land.

---

## Suggested priority if we act on any of this

1. **Lifespan component+system** (Candidate 2) — low effort, fixes an interruption
   leak, good way to build ECS fluency outside the water module.
2. **Terrain → entity + components** (Candidate 1) — the real architectural
   simplification; plan it deliberately, it touches serialization and rendering.
3. Selection tags (Candidate 3) — only as a rider on #2.

Explicitly *not* recommended: ECS-ifying sessions, the sand layer, or pushing the
water sim further into per-entity systems.
