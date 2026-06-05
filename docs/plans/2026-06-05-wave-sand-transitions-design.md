# Wave-segment driven sand tile transitions

## Goal

As a wave segment fully sweeps over a sand tile in its column, transition the sand tilemap one state forward:

- moist sand tile -> moist/wet transition tile
- moist/wet transition tile -> cleared (no graphic)
- cleared -> no-op

This makes the visible transition row migrate down with the surging wave per column.

## Trigger

"Fully covers" = wave segment's leading edge reaches the tile's bottom edge. This is equivalent to the segment entering the next game row.

When a segment enters row `r` (existing `enterRow` path), the tile at row `r-1` is now fully covered.

Constraints:

- Surging phase only. `handleTileEntries` already short-circuits on non-surging state, so reusing that path gives this for free.
- Per column. Each segment is one column wide; each column progresses independently.
- Idempotent per cell: state only advances if it matches the expected prior state.

## Event

Extend `WaveSegmentEvent` with:

```ts
{ type: "tileCovered"; col: number; row: number; depth: number }
```

In `WaveSegment.enterRow(r)`, after the existing entry handling, emit `tileCovered` for `row = r - 1` when `r - 1 >= 0`. Do not emit for the first row entered or once the segment is crashing/receding.

## Sand layer state machine

Replace one-shot graphic assignment with a tracked per-cell state.

```ts
type SandTileState = "moist" | "transition" | "cleared";
private states: SandTileState[][]; // [tilemapRow][col]
```

Initial state matches today's rendering:

- `gameRow === TRANSITION_GAME_ROW` (2) -> `"transition"`
- `gameRow >= MOIST_START_GAME_ROW` (3) -> `"moist"`
- otherwise -> `"cleared"` (ocean rows above grid)

New method:

```ts
coverCell(col: number, gameRow: number): void
```

Behavior:

- `moist` -> swap sprite to transition, state becomes `"transition"`
- `transition` -> clear graphics, state becomes `"cleared"`
- `cleared` -> no-op

Cache `moistSprite` and `transitionSprite` as fields so `coverCell` can reuse them. Drop `clearCell` (subsumed) unless an existing caller still depends on it.

Out-of-range `col` / `gameRow` are silently ignored.

## Wiring

`WaveEventApplier` gains an optional `SandLayer` dependency.

```ts
constructor(grid: GridView, sandLayer?: SandLayer)

if (event.type === "tileCovered") {
  this.sandLayer?.coverCell(event.col, event.row);
  return result;
}
```

`LevelSession` and `TideSession` pass their `SandLayer` instance when constructing the applier. Existing applier consumers without a sand layer keep working unchanged.

## Tests

`wave-segment.test.ts`

- Entering row `r` emits `tileCovered` for `r - 1` with the current depth.
- No `tileCovered` emitted for the first row a segment enters.
- No `tileCovered` emitted after the segment transitions to crashing or receding.
- Castle-flooded, blocked, and dissipated paths do not produce spurious `tileCovered` events.

`sand-layer.test.ts`

- Initial state: row 2 has the transition sprite, rows 3+ have the moist sprite, rows above grid are empty.
- `coverCell` on a moist tile installs the transition sprite and advances state.
- `coverCell` on a transition tile clears graphics.
- `coverCell` on a cleared tile is a no-op (graphic count unchanged).
- Out-of-range coordinates do not throw.

`wave-event-applier.test.ts`

- `tileCovered` event invokes `sandLayer.coverCell(col, row)`.
- Applier constructed without a sand layer ignores `tileCovered` events without throwing.

## Out of scope

- Multi-step coverage (e.g. moist -> cleared in one pass).
- Receding-phase changes.
- Cross-column propagation.
- Restoring sand state when a wave dissipates short of the tile.

## Verification

`node --run lint`, `node --run build`, `node --run test:unit` must all pass before the change is considered done.
