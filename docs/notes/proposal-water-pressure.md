# Technical Design Document: Sparse Fluid Simulation for Coastal Wave Fronts

## 1. Executive Summary

The goal of this architectural update is to transition the wave mechanic from a purely directional, script-driven movement into a dynamic, pressure-gradient fluid simulation. The system must allow waves to advance inland over a sloped beach, spread laterally around player-built terrain structures (walls, trenches, sandcastles), and naturally recede back to the ocean.

To maintain performance, the architecture utilizes a **Sparse Cellular Automata** simulation built over Excalibur’s native **Entity-Component-System (ECS)** framework. Instead of simulation over a full-board pre-filled grid, computational resources are spent only where active water exists.

---

## 2. Architectural Foundation: Excaliburjs ECS Background

Excaliburjs architecture heavily embraces the ECS pattern. In this paradigm:

* **Entities:** Lightweight containers defined entirely by the components attached to them. Crucially, Excalibur’s `Actor` class inherits from `Entity`. This means your existing `WaveSegment` actors can seamlessly act as ECS entities without rewriting them from scratch.
* **Components (`ex.Component`):** Pure, lightweight data structures. They hold state variables but contain zero gameplay or execution logic.
* **Systems (`ex.System`):** The global processors of the game loop. Systems specify a *Query* (a filter for specific components). Every frame, the engine gathers all matching entities and passes them to the system to run unified, batch-processed mathematics.

By decoupling the water data and simulation logic from individual actor update ticks, we minimize processing overhead, maintain spatial synchronization, and avoid execution-order bugs (race conditions).

---

## 3. Core Concept: Hydrostatic Pressure Gradients

Instead of hardcoding a southern velocity, the driving force of all fluid movement in this model is **Total Height**, which directly correlates to hydrostatic pressure.

$$\text{Total Height} = \text{Ground Elevation} + \text{Water Depth}$$

Water naturally flows down gradients from areas of high Total Height to lower Total Height.

* **The Baseline Slope:** Ground elevation is determined by a global mathematical config mapping the beach slope (height increasing as coordinates move South/Inland).
* **Terrain Alterations:** User-built structures act as local modifiers, adding to or subtracting from this baseline elevation.
* **The Forward Engine:** When a massive volume of water spans at the ocean boundary, its high depth spikes its Total Height, allowing it to temporarily overcome the rising slope and push inland. As it spreads thin, the slope's elevation eventually dominates, reversing the gradient and causing the water to recede back North.

---

## 4. Component Definitions

### A. `WaterComponent`

Attached exclusively to active `WaveSegment` actors driving the wave front or pooling water.

* **`gridX`, `gridY` (integers):** The discrete coordinate grid position of this specific segment.
* **`depth` (float):** The current localized volume of water.
* **`velocity` (Vector2):** An internal simulation momentum vector tracking the directional kinetic energy of the water mass. *Note: This is separate from Excalibur's built-in physics velocity.*

### B. `TerrainComponent`

Attached to any player-built obstacle actor or terrain modifier.

* **`gridX`, `gridY` (integers):** The discrete coordinate grid position.
* **`elevationOffset` (float):** Positive for barriers/walls, negative for dug trenches.
* **`isSolid` (boolean):** A binary flag indicating if water flow is completely obstructed through this cell.

---

## 5. System Pipeline: `WaveDynamicSystem`

The `WaveDynamicSystem` handles the simulation logic on every frame tick via a **two-pass evaluation** loop to preserve mass and prevent positional calculation bias.

```
+-------------------------------------------------------------+
|                WaveDynamicSystem: Per-Frame Pipeline        |
+-------------------------------------------------------------+
                               |
                               v
               +-------------------------------+
               | 1. Build Spatial Maps         |
               |    - Map active Water cells   |
               |    - Map sparse Terrain cells |
               +-------------------------------+
                               |
                               v
               +-------------------------------+
               | 2. Pass 1: Calculate Outflow  |
               |    - Compute Total Height     |
               |    - Measure 4-Way Gradients  |
               |    - Queue Flux allocations   |
               +-------------------------------+
                               |
                               v
               +-------------------------------+
               | 3. Pass 2: Mass & Momentum    |
               |    - Apply Flux (Add/Deduct)  |
               |    - Update Depth values      |
               |    - Calculate Inertial Push  |
               +-------------------------------+
                               |
                               v
               +-------------------------------+
               | 4. Cleanup & Life Cycle       |
               |    - Evaporate thin cells     |
               |    - Dynamic spawning         |
               +-------------------------------+

```

### Pass 1: Flux Evaluation

1. Gather all active `WaterComponent` entities.
2. Query a local cache of `TerrainComponent` entities to find any intersecting or adjacent user structures.
3. For each active water cell, compute its current `Total Height` against its four immediate cardinally adjacent neighbors (North, South, East, West).
4. If the current cell's Total Height is greater than a neighbor's, compute a flow volume relative to the height difference and delta time, clamping it to prevent drawing more water than the cell currently contains. Queue this as a temporary outbound flux value.

### Pass 2: Mass Redistribution and Inertial Update

1. Apply the queued fluxes across the active simulation map. Deduct fluid from outbound cells, add it to inbound cells.
2. If water flows into a grid slot that **already contains** a `WaterComponent`, add the inbound depth directly to it. **No merging logic is required.**
3. If water flows into an empty slot with a lower gradient, invoke a dynamic factory function to spawn a *new* `WaveSegment` actor at those grid coordinates with the allocated initial depth.
4. Calculate an **Inertial Push vector** based on net fluid transfer direction. Blend this new pressure-driven force with the component's existing `velocity` using a momentum retention factor. This handles visual direction tracking and allows waves to naturally roll over level surfaces.

---

## 6. Key Integration Concepts & Relationships

### Grid Rigidity vs. Texture Fluidity

To prevent spatial mapping corruption, `WaveSegment` actors must remain perfectly locked to their target grid intervals.

* **Do not use Excalibur's native `actor.vel` on `WaveSegment` objects.** If an actor drifts to a floating-point position like `(12.4, 45.1)`, integer-based grid lookup maps will break. Position changes occur strictly via step-wise neighborhood spawning and depth transference.
* **Use `WaterComponent.velocity` for graphics processing.** Because you are mapping data to a custom master shader, pass this internal simulation velocity straight to the WebGL context. The physical actors remain rigid grids, but the underlying texture will dynamically shear, warp, and travel based on the fluid flow data, providing an illusion of organic velocity.

### Ground Synthesis

Rather than spawning thousands of baseline sand actors to represent the slope, the system uses a **Functional Elevation Blend**:


$$\text{Calculated Ground Height} = f(\text{gridY}) + \text{TerrainComponent.elevationOffset}$$


Where $f(\text{gridY})$ is a global, mathematical configuration representing the natural linear or exponential rise of the beach.

### The Receding Lifecycle (Backwash & Absorption)

1. **Natural Recede:** Including the North direction in the pressure-gradient calculation automatically initiates the backwash phase. When forward wave momentum halts, the lower baseline elevations of the North coordinates pull the water back toward the ocean.
2. **The Ocean Sink:** To prevent computational clutter at the boundary, any water flowing North past the designated baseline shoreline coordinate is deleted rather than spawning continuous ocean nodes.
3. **Sand Infiltration:** Every update frame, deduct a constant absorption rate from all active `WaterComponent` depths. When a segment's depth drops below a set threshold (e.g., < 0.02), call `actor.kill()`. This naturally models water sinking into the sand, ensuring the tail end of a wave realistically thins out and dissipates.
