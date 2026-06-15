# Pressure wave field timing & sequence

Reference for how the pressure-driven water field (`PRESSURE_WATER_ENABLED`) behaves
over a single wave: source-open surge, continuous pressure equalization, and the
source-closed drain. Sourced from `src/wave/wave-dynamic-system.ts` and `src/config.ts`.

> **Key correction to the intuitive model:** there is no discrete "equalize" phase
> between source-on and drain. Pressure equalization (the flux relaxation) runs on
> **every sim tick the entire time**. The only thing that switches is a single binary,
> `sourceOpen`, gated by the surge window. The advance-then-recede arc is emergent:
> water is *injected while the source is open* and *drains once it closes*, not three
> separate stages.

## Constants (`src/config.ts`)

| Knob | Value | Role |
|---|---|---|
| `PRESSURE_SIM_STEP_MS` | `1000/60` ≈ 16.67ms | fixed sim tick (decoupled from frame rate) |
| `PRESSURE_SURGE_WINDOW_MS` | 1500 | how long the source stays open |
| `PRESSURE_FLUX_COEFF` | 0.18 | flux rate while source open (surge) |
| `PRESSURE_RECEDE_COEFF` | 0.08 | flux rate after source closes (drain, slower) |
| `PRESSURE_INERTIA_COEFF` | 0.55 | momentum term (sustains advance + overshoot) |
| `PRESSURE_DRAIN_THRESHOLD` | 0.01 | depth below which a cell is dropped |
| `PRESSURE_CASTLE_FLOOD_DEPTH` | 0.5 | wet-castle depth that ends the wave |

> These are live tuning dials; values reflect the state as of 2026-06-15. Check
> `config.ts` for current numbers.

## Lifecycle: two regimes + termination

```mermaid
stateDiagram-v2
    [*] --> Surge: playWave(spawns)
    Surge: SURGE  (source OPEN)
    Surge: simTime < 1500ms
    Surge: coeff = 0.18
    Surge: row 0 pinned to sourceDepths (Dirichlet)
    Surge: water driven in + advances downfield
    Drain: DRAIN  (source CLOSED)
    Drain: coeff = 0.08
    Drain: row 0 no longer replenished
    Drain: water relaxes + drains (slope + ocean sink)
    Surge --> Drain: simTime >= 1500ms
    Surge --> Flood: castle cell wet >= 0.5
    Drain --> Flood: castle cell wet >= 0.5
    Drain --> Empty: all cells < 0.01
    Flood --> [*]: onComplete (castleFlooded)
    Empty --> [*]: onComplete
```

The ocean sink (north of row 0, head 0) is **always** on. During surge the source pin
overpowers it (net inflow); once the source closes, row-0 water drains back north off
the board, which is a large part of the recede.

## Per-frame update loop (`WaveDynamicSystem.update`)

```mermaid
flowchart TD
    A[frame: accumulate elapsed ms, cap at 8 steps] --> B{accumulator >= 16.67ms?}
    B -- no --> Z[wait next frame]
    B -- yes --> C{simTime >= 1500ms?}
    C -- yes --> D[sourceOpen = false]
    C -- no --> E[keep sourceOpen]
    D --> F[coeff = recede 0.08]
    E --> G[coeff = flux 0.18]
    F --> H[computeFluxStep one tick]
    G --> H
    H --> I[accumulator -= step; simTime += step]
    I --> B
    B -- drained --> J[onResolveCells: erosion + hole absorb + castle flood]
    J --> K[reconcile: spawn/update/kill WaterCells, emit WaterCellAdded]
    K --> L{done OR source closed and 0 cells?}
    L -- yes --> M[onComplete]
    L -- no --> Z
```

The loop runs *multiple* fixed sub-steps per rendered frame if the frame was long
(catch-up, capped at 8 steps so a stall can't explode). `simTime` only advances on
executed steps, so the 1500ms surge window is exactly 90 ticks regardless of frame rate.

## One sim tick (`computeFluxStep`) — the equalization math

```mermaid
flowchart TD
    A[load depth + carried velocity from wet cells] --> B{source open?}
    B -- yes --> C[pin row 0: depth = max of current and sourceDepths]
    B -- no --> D[skip pin]
    C --> E[head = ground elevation + depth per cell]
    D --> E
    E --> F["per cell, per 4 neighbors:
    pressureOut = max(0, head - neighborHead) * coeff
    momentum = max(0, vel · dir) * 0.55  (open edges only)
    desired = pressureOut + momentum"]
    F --> G["clamp: scale = sum > depth ? depth/sum : 1
    (can't push out more than you hold -> mass conserved, non-negative)"]
    G --> H[apply deltas; velocity = net flux vector]
    H --> I{source open AND row 0?}
    I -- yes --> J[re-pin row 0 after flux]
    I -- no --> K[skip]
    J --> L[drop cells <= 0.01; emit survivors + newly-wet neighbors]
    K --> L
```

"Pressure equalizing across the field" is exactly step **F→G**: every wet cell pushes
water toward lower-head neighbors at rate `coeff`, scaled so it never overdraws. That is
a relaxation toward uniform head, running continuously. It never fully equalizes during
surge because the row-0 pin holds that boundary high and the slope/ocean-sink keep
bleeding it; after the source closes it relaxes *and* empties.

## Plain-language timeline

1. **t = 0 → 1500ms (surge, coeff 0.18):** row 0 held at `sourceDepths` each tick (a
   held-open tap). Flux + momentum (0.55) drive water down the slope and laterally; the
   front advances and overshoots.
2. **t = 1500ms (switch):** `sourceOpen → false`. The tap closes; nothing replenishes row 0.
3. **t > 1500ms (drain, coeff 0.08):** same kernel, slower rate. Carried momentum lets it
   coast forward briefly, then the slope plus the always-on ocean sink pull it back; the
   field recedes. The slower coeff is deliberate so the drain does not snap out faster
   than the water came in.
4. **End:** completes the instant a castle cell is wet >= 0.5 (flood, `done`), or once
   every cell has drained below 0.01.
