# Trapped water never drains (wall-enclosed basins)

- **Date:** 2026-06-14
- **Area:** pressure-driven wave runtime (`PRESSURE_WATER_ENABLED = true`)
- **Severity:** high — the wave phase can hang indefinitely
- **Status:** open

## Symptom

When walls are built so they enclose a basin (a ring/pocket of walls around lower
ground), water that flows in during the surge gets stuck and never clears out. It
sits at a fixed level forever instead of receding.

> Reported with a screenshot of a wall-enclosed pocket. (Screenshot not attached
> to this writeup; reproduce per the steps below.)

Because the wave only resolves when all water is gone, the trapped puddle also
means the wave phase never ends.

## Repro

1. In planning, build walls that fully enclose one or more interior cells (so the
   enclosed cells are lower than every surrounding wall crest), over flat ground
   (not holes).
2. Run the wave. Water overtops/enters the basin during the surge.
3. After the source closes and the open water recedes to the ocean, the water
   inside the basin remains, holding a constant depth.

## Root cause

The flux solver only moves water *downhill* to a lower-head neighbor, plus the
ocean sink north of row 0. There is no evaporation, seepage, or absorption term
for ordinary (non-hole) land.

In `computeFluxStep` (`src/wave/wave-dynamic-system.ts:95`), outflow from a cell is:

```
out = max(0, h - neighborHead) * coeff
```

where `h = groundAt(col,row) + depth`. Once water in a wall-enclosed basin levels
off below the surrounding wall crests, every in-bounds neighbor has
`neighborHead >= h`, so `out = 0` in all four directions. The only sinks are:

- a lower-head neighbor (blocked — walls are higher), or
- the ocean sink, reachable only from row 0 (basin is interior).

Holes drain via `applyTerrainFeedback` into `puddleDepth`, but that path is
hole-only and capped at finite capacity; a wall basin over flat ground has no
sink at all.

So the basin depth stays above `PRESSURE_DRAIN_THRESHOLD` (`0.01`,
`src/config.ts:138`) indefinitely. The wet-cell set never empties, and the wave
resolves only when `!sourceOpen && cells.length === 0`
(`src/wave/wave-dynamic-system.ts:231`) — which never becomes true.

```mermaid
flowchart LR
  S[Surge fills basin] --> L[Water levels off below wall crests]
  L --> Z["outflow = max(0, h - neighborHead) = 0 in all dirs"]
  Z --> T[depth stays > drainThreshold forever]
  T --> H["cells.length never 0 -> wave never resolves"]
```

## Fix direction (unconfirmed)

Reporter's hunch: *find the stale/land-locked water and clear it.* Options to
explore:

- Detect cells with no descending flow path to the ocean sink (land-locked basins)
  and drain/evaporate them once the source is closed.
- Add a small recede-phase evaporation/seepage term so water with zero outflow
  decays toward `drainThreshold` instead of persisting.
- Add a safety timeout so a wave always resolves even if some water is trapped.

These are starting points, not a chosen solution — to be designed before
implementing.
