# Water equalization redesign

## Problem

When a wall blocks water, the simulation dumps 100% of the blocked water into adjacent non-wall columns. This amplifies water on either side of defenses, making "wall + hole" strategies counterproductive. A player who builds walls in front of deep holes watches the water route around both.

The root cause: two separate lateral mechanisms (blocked redistribution and spread equalization) that each hack around the absence of a real equalization model.

## The model

Water follows gravity. At each row during the top-down advance, after initial wall/hole interaction, water settles laterally until no two adjacent columns differ by more than 1 unit. This single rule replaces both the blocked-redistribution and spread-equalization passes.

### Per-row simulation steps

1. **Inject**: Each column receives its incoming water from the row above, reduced by `terrainSlope`.
2. **Interact**: Walls reduce incoming water by their effective elevation. Holes absorb water up to remaining depth. Fully blocked water stays in the settle pool (not discarded).
3. **Settle**: Iteratively equalize water levels across columns (see below).
4. **Snapshot**: Record settled water levels. These become `currentHeights` for the next row.

### Settle algorithm

Each cell has an **effective surface** = `max(0, terrainSlope + elevation) + waterLevel`.

Per iteration:
- Compare each column's effective surface with its left and right neighbors
- If the difference is > 1, transfer `floor(difference / 2)` units from the higher cell to the lower
- Holes pull water naturally (low effective surface). Walls push water away (high effective surface even when dry)
- Water levels are clamped to zero

Convergence: integer transfers with a > 1 threshold guarantee a stable state where no adjacent cells differ by more than 1. The loop can early-exit when no transfers happen.

`SETTLE_STEPS` (default ~8) caps iterations per row. The > 1 threshold is hardcoded, not configurable, since it's fundamental to the quantized model.

### Blocked water

Current code discards blocked water from `rowWater` and separately redistributes it. New code instead keeps blocked water in `rowWater` at its full incoming height. The settle step then drains it naturally to lower neighbors. If there are no lower neighbors (walled in on both sides), the water stays put and doesn't advance.

### Wave recede

Stays as a separate bottom-to-top pass for now. The recede pass should also use the same settle logic per row so water receding through walls and holes equalizes the same way.

Eventually, a full iterative solver could model advance and recede as one simulation (source injection + gravity), but that's a future change.

## Refactoring: strategy pattern

Extract per-row lateral behavior behind a `RowSolver` interface:

```typescript
interface RowSolver {
  settle(input: {
    rowWater: number[];
    elevations: number[];
    holeDepths: number[];
    terrainSlope: number;
  }): RowSettleResult;
}

interface RowSettleResult {
  waterLevels: number[];
  absorbed: number[];
}
```

`simulateAdvance` and `simulateRecede` take a `RowSolver` and call it per row. Snapshot, castle-flood, and wall-event logic stays in the outer loop.

Two implementations:
- **`LegacyRowSolver`**: Current blocked-redistribution + spread. Keeps existing tests green during migration.
- **`EqualizingRowSolver`**: The settle algorithm described above.

This also sets up a future swap to a full physics solver. A grid-level solver could implement a broader interface while the row-level one stays available for simpler cases.

## Config changes

Remove:
- `LATERAL_SPREAD_FACTOR`
- `LATERAL_SPREAD_THRESHOLD`

Add:
- `SETTLE_STEPS` (max iterations per row, default ~8)

## Test plan

**EqualizingRowSolver unit tests** (isolated, no full simulation):
- Flat water across columns stays flat (no transfers when diff <= 1)
- Water flows into adjacent hole
- Water flows away from wall
- Blocked water pools and drains to lower neighbors
- Convergence within step limit
- No transfer when all surfaces within 1 of each other

**Integration tests** (full `simulateAdvance`/`simulateRecede` with new solver):
- Fortress debug case: no water amplification around walls, holes behind walls fill
- Simple flat grid: behaves same as before
- Single wall column: water stops, doesn't amplify neighbors

**Existing tests**: `LegacyRowSolver` tests kept passing until we remove it.

**Replay tool**: Works unchanged (same `WaveResult` shape).
