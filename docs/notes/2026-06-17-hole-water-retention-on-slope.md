# Hole water retention on a slope — investigation & open design decision

**Status:** root cause confirmed; fix approach NOT yet chosen (awaiting design decision below).
**Branch:** `feat/basin-siltation`
**Mode/phase:** Classic level mode, wave phase recede + commit.

## Symptom

Player digs a vertical "trench" of holes whose dug depth increases going south
(down-board), expecting it to fill and hold water. After a wave that visually
covers the whole board, the holes end up holding only a thin, uneven film of
water; some read empty. The depth the player dug appears irrelevant to how much
water is retained.

Reported via the `/bug` skill with a screenshot, then a debug-JSON capture (press
`D`; see "Debug Serialization" in `AGENTS.md`). The captured board is a single
column of 5 holes, dug depths `-1,-1,-2,-2,-3` top→bottom, no walls, castle far
south, surrounded by flat ground. Committed `puddleDepth`s came back as an
alternating low/high pattern (saddles low, pits higher), none near full.

## How it was reproduced

The terrain actors import Excalibur and can't run in pure Node (see the
"Debug Serialization" note in `AGENTS.md` about the retired replay script), but the
flux/seep math is pure. The investigation re-implemented the pure logic of
`computeFluxStep` and `seepDepth` (both in `src/wave/wave-dynamic-system.ts`)
verbatim in a standalone Node script under `./.tmp/` (ephemeral, per the repo's
temp-file convention; rebuild from the two pure functions + the config constants
below if needed). It ran the real surge→recede loop (`WaveDynamicSystem.update`)
with the actual config constants and the captured board. The simulated resting
depths matched the observed committed `puddleDepth`s in both pattern and
magnitude (small deltas attributable to seep-cadence discretization and
`Hole.commitWave` folding). A unit test in the `wave-dynamic-system.test.ts`
suite (the `unit` Vitest project, which already imports `computeFluxStep`) is the
right home for a permanent regression repro.

Key constants involved (all in `src/config.ts`): `TERRAIN_SLOPE`,
`PRESSURE_SEEP_RATE_PER_MS`, `PRESSURE_DRAIN_THRESHOLD`, `PRESSURE_RECEDE_COEFF`,
`PRESSURE_FLUX_COEFF`, `PRESSURE_SURGE_WINDOW_MS`, `PRESSURE_MAX_RECEDE_MS`,
`PRESSURE_SETTLE_STABLE_STEPS`, `PRESSURE_SETTLE_VELOCITY_EPSILON`,
`PRESSURE_INERTIA_COEFF`. The decisive value is `TERRAIN_SLOPE` (the beach rises
this much per row going south/down-board).

## Root cause (three compounding effects)

**1. On a slope, a hole retains only the elevation step-down to its lowest
neighboring floor — not its dug depth.**
Ground floor at a cell = `TERRAIN_SLOPE * row - digDepth` (see `groundAt` in
`WaveFieldRuntime` / `src/wave/wave-field-runtime.ts`). When the per-row dig
increment roughly equals `TERRAIN_SLOPE`, the absolute floors do not descend —
they form a washboard (alternating pit/saddle). The flux kernel equalizes water
*surface* across connected wet cells and water drains downhill (north, toward the
ocean sink) over the lowest lip, so each hole holds only ~the drop to its lowest
neighbor's floor. Dug depth is wasted: the deepest hole held barely more than the
shallowest. To actually retain water on a slope under the current model the
player must contain the *downhill* (north) side.

**2. The settle detector ends the wave on an un-equalized field.**
`isFieldSettled` (`src/wave/wave-dynamic-system.ts`) declares "at rest" when every
cell's velocity is below `PRESSURE_SETTLE_VELOCITY_EPSILON` and nothing is
seepable above its rim. During recede with the small `PRESSURE_RECEDE_COEFF`,
velocities fall below epsilon while a gentle surface gradient still remains, so
the wave commits a frozen, uneven washboard snapshot slightly above the true
hydrostatic equilibrium. This is what produces the alternating committed
`puddleDepth`s rather than a clean level.

**3. Seep and silt are decoupled.**
The rim-aware seep in `postupdate` (`src/wave/wave-dynamic-system.ts`, helper
`seepDepth`) simply deletes water depth to let the wave terminate; it has no
terrain consequence. Only water still *resting* in a hole at the settle instant
folds into `puddleDepth` and silts one step via `Hole.commitWave`
(`src/model/terrain/hole.ts`), routed through the `holeCommit` event in
`src/wave/wave-event-applier.ts` and `WaveFieldRuntime.onComplete`. So water that
leaves a hole via seep silts nothing — a player-visible inconsistency
(water "soaked into the ground" but the hole did not fill in).

## Investigation dead-end worth recording

An early hypothesis ("an isolated deep hole retains fine; chaining is what
hurts") was tested by simulating a single isolated `-3` hole and is FALSE as
stated — but for a non-obvious reason. A lone deep hole far down-board is *beyond
the wave's reach*: flat ground rises `TERRAIN_SLOPE`/row, so a source surface of
~2.5 only floods to the row where the beach plane reaches 2.5; rows past that stay
dry and the hole never fills. In the real board the holes fill *because* they are
chained into a low channel that carries water past the flood line — i.e. chaining
helps water *arrive*; the failure is in *retention*, per effect (1). Do not use a
single isolated deep hole as a repro; it tests wave reach, not retention.

## Relevant code (by reference)

- Siltation feature plan + design doc: `docs/plans/2026-06-15-hole-basin-pooling-and-siltation.md`
  and `...-design.md`.
- Implementing commit series (this branch): the `feat(wave)`/`feat(model)` commits
  from "plumb cell floor onto WaterComponent" through "pool water live in holes and
  silt at commit" and the dead-code cleanup that follows. `git log` on
  `src/wave/wave-dynamic-system.ts` and `src/wave/wave-terrain-feedback.ts` shows them.
- Flux + seep + settle: `src/wave/wave-dynamic-system.ts`
  (`computeFluxStep`, `seepDepth`, `isFieldSettled`, `update`, `postupdate`).
- Ground/rim suppliers + commit wiring: `src/wave/wave-field-runtime.ts`
  (`groundAt`, `groundLevelAt`, `onComplete`).
- Post-flux feedback (castle flood only now): `src/wave/wave-terrain-feedback.ts`.
- Commit/silt: `src/model/terrain/hole.ts` (`commitWave`),
  `src/wave/wave-event-applier.ts` (`holeCommit`).
- Tuning constants: `src/config.ts`.
- Erosion already treats sub-rim trench water as harmless (hydrostatic charge uses
  head above the rim); see the `wave-erosion.ts` description in `AGENTS.md`. The
  chosen retention model should stay consistent with that rim convention.

## Open design decision (owner: user)

Does a hole behave as a **cistern** or follow **downhill drainage**? This choice
determines the entire fix; the rest (settle epsilon in effect 2, seep/silt
coupling in effect 3) is secondary tuning to apply on top of whichever model is
chosen.

- **(A) Cistern** — each hole fills and holds to its own rim (the beach plane at
  its row), independent of downhill neighbors. Dug depth = capacity. Matches the
  intuition "I dug a hole, the wave covered it, it is now full." Simplest and most
  predictable. Cost: drops the "water channels to the deepest connected hole" goal
  stated in the siltation design doc; water no longer flows downhill between holes.

- **(B) Physical basin / spill-rim** — compute each connected basin's true
  spillover rim and fill to it; water flows downhill and a trench open on its
  downhill side genuinely drains. Keeps channeling and is physically correct. Cost:
  retaining water on a slope requires the player to contain the downhill lip (wall
  or higher dig), which is exactly the surprising behavior reported — so it stays
  unintuitive unless the UI is updated to teach it. More implementation
  (connected-component detection + boundary rim scan).

Once chosen, write the fix plan in `docs/bugs/` (per `AGENTS.md`), and also decide
whether to (2) tighten/replace the settle check so commit happens at true
equilibrium, and (3) couple seeped water to silting (or otherwise reconcile the
"water vanished but hole did not change" inconsistency). Update `docs/gameplay.md`
in the same change since this is a gameplay behavior change.
