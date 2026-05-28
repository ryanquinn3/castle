# Castle - Game Design Document

## Concept

A turn-based, tile-based wave defense game. Each level, the player uses a limited number of scoops to reshape the terrain before a wave of water advances from the top of the screen toward a castle. The goal is to survive as many levels as possible.

Terrain is **persistent** — digs and builds carry over from level to level. The player accumulates defenses across the run; only a game over resets the terrain.

## Grid

- **Size**: 20 tiles wide × 20 tiles tall (configurable)
- **Tile type**: All sand (homogeneous for MVP)
- **Elevation**: Integer per tile, starting at 0
  - Positive = raised (wall/berm)
  - Negative = dug (hole/moat)
  - Cap: configurable, default max +10 / min -10

## Castle

- Single tile, fixed at the horizontal center (tile 10), at ~2/3 of vertical height (tile 13)
- Cannot be moved, dug, or raised
- If any water reaches the castle tile, the player loses the level (game over)
- The wave does **not** reach the castle until level 5 — see Wave Reach below

## Turn Structure

Each level has two phases:

### 1. Planning Phase
The player uses **tools** from the toolbar to reshape terrain. Two tools are available:

- **Shovel** (hotkey: 1): Click a tile to dig, lowering elevation by 1 and adding 1 sand to inventory
- **Wall** (hotkey: 2): Click a tile to place sand, raising elevation by 1 and removing 1 sand from inventory. Disabled when sand is 0.

Each tool action costs 1 action from the budget. The planning phase ends when the action budget is depleted (classic/level mode) or the timer expires (tide mode).

**Sand inventory** persists across waves and levels. It only resets on game over.

**Action budget per level (classic mode):**
- Level 1: 5 actions
- Each subsequent level: +1 action
- Configurable via `SCOOP_START` and `SCOOP_INCREMENT` constants

**Toolbar UI:** Always visible at the bottom-center of the screen. Shows tool slots with sprites, hotkey indicators, and sand count on the wall tool. Dimmed when not in planning phase.

### 2. Wave Phase
The wave advances automatically when the planning phase ends:
- The wave starts at the top row and advances downward, row by row
- Each column tracks its own current wave height independently
- Wave columns start at **non-uniform heights** — each column gets its own randomised initial height (see Non-Uniform Wave below)
- The wave only advances **partway down the grid** in early levels (see Wave Reach below)

**Wave/tile interaction per column, per row:**

| Tile elevation | Effect |
|---|---|
| >= wave height | Wave blocked in this column. Column's wave height → 0 |
| 0 (flat) | Wave passes through unchanged |
| Positive (wall height W) where W >= wave height | Wave fully blocked in this column. Column wave height → 0 |
| Positive (wall height W) where W < wave height | Water overtops: wave continues at (wave height - W) |
| Negative (hole of depth D) where D >= wave height | Wave absorbed. Column wave height → 0 |
| Negative (hole of depth D) where D < wave height | Wave continues at (wave height - D) |

The wave phase plays out as an animation — water visually advances row by row so the player can see how their defenses performed.

#### Non-Uniform Wave

Real waves do not arrive as a perfectly flat front. Each column gets a randomised initial height:

```
columnHeight[col] = baseWaveHeight + randomVariation
```

where `randomVariation` is drawn uniformly from `[-WAVE_HEIGHT_VARIANCE, +WAVE_HEIGHT_VARIANCE]` and the result is clamped to a minimum of 0. The variation is re-randomised each level. `baseWaveHeight` is `waveHeightForLevel(level)` as before.

This means some columns may arrive taller (more dangerous) and some shorter or even at zero — creating natural gaps in the wave front that reward strategic defense placement.

#### Wave Reach

The wave does not travel all the way to row 29 every level. The maximum row the wave can reach increases with level:

```
waveReach = min(GRID_HEIGHT, WAVE_REACH_START + (level - 1) * WAVE_REACH_INCREMENT)
```

- On level 1 the wave stops at row `WAVE_REACH_START` (e.g. row 10 — the top half of the grid).
- Each level the reach grows by `WAVE_REACH_INCREMENT` rows.
- The castle sits at row 13. With `WAVE_REACH_START = 10` and `WAVE_REACH_INCREMENT = 1`, the wave cannot reach the castle until level 5.
- This gives the player time to build defenses before the threat reaches them, and makes early levels purely about learning.

Simulation stops after `waveReach` rows; all rows below that are untouched regardless of wave height.

### Erosion

After each wave, tiles that were hit (had wave height > 0 entering them) accumulate a hit counter. When a tile's hit count reaches 3, its elevation shifts one unit toward 0 and the counter resets:

- A wall at elevation +3 hit 3 times → becomes +2
- A hole at elevation -2 hit 3 times → becomes -1
- A flat tile (elevation 0) cannot erode further — hit count still increments but elevation does not change

This means **the player's defenses degrade over time**. A deep moat will gradually fill in; a tall wall will slowly be worn down. Players must continuously invest scoops into maintaining and deepening their defenses.

## Progression

- Surviving a level advances to the next
- **Terrain persists** — digs and builds carry over; the grid is never reset on level advance
- Wave base height increases each level (configurable increment)
- Wave reach increases each level, eventually threatening the castle
- Wave columns have non-uniform heights (randomised each level)
- Scoop budget increases each level (+1, configurable)
- Erosion gradually degrades terrain hit by waves
- No win condition — the goal is maximum level reached (high score)

## Loss Condition

Water reaches the castle tile during the wave phase.

## Reset on Game Over

When the player restarts after a game over:
- Grid is reconstructed -- all terrain returns to flat elevation 0
- All tile hit counts (erosion counters) reset to 0
- Sand inventory resets to 0
- Level resets to 1

## Configurable Constants (to be tuned)

| Constant | Default | Description |
|---|---|---|
| `GRID_WIDTH` | 20 | Tiles wide |
| `GRID_HEIGHT` | 20 | Tiles tall |
| `MAX_ELEVATION` | 10 | Max tile height |
| `MIN_ELEVATION` | -10 | Min tile depth |
| `SCOOP_START` | 5 | Scoops on level 1 |
| `SCOOP_INCREMENT` | 1 | Additional scoops per level |
| `WAVE_HEIGHT_START` | 1 | Base wave height on level 1 |
| `WAVE_HEIGHT_INCREMENT` | 1 | Base wave height increase per level |
| `WAVE_HEIGHT_VARIANCE` | 1 | Max random per-column height deviation (±) |
| `WAVE_REACH_START` | 10 | Rows the wave travels on level 1 |
| `WAVE_REACH_INCREMENT` | 1 | Additional rows of reach per level |
| `WAVE_ROW_DELAY_MS` | 120 | Milliseconds between each row of wave animation |
