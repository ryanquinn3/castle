# Wave overlay shader -- implementation plan

Based on [design doc](./2026-06-10-wave-overlay-shader-design.md).

## Task 1: Create `WaveOverlay` actor with coverage texture

**New file:** `src/wave/wave-overlay.ts`

`WaveOverlay` extends `Actor`. Spans the full grid, `z: 7`.

**Constructor:**
- Receives grid params (gridLeft, gridTop, tileSize, width, height)
- Positions at grid center
- Creates offscreen `HTMLCanvasElement` at grid pixel resolution for coverage texture
- Creates `Canvas` graphic with `cache: false` that paints the coverage canvas
- Calls `this.graphics.use(canvas)`

**`onInitialize`:**
- Creates GLSL material via `engine.graphicsContext.createMaterial()` (needs WebGL context, not available in constructor)
- Assigns to `this.graphics.material`

**`onPreUpdate`:**
1. Clear offscreen coverage canvas
2. Query `this.scene.actors` for `WaveSegment` instances (finds both surging segments and still clones that are added directly to the scene)
3. Build per-column data: for each segment, read `col`, `pos.y`, `currentDepth`, `state`
4. Per column, fill vertical coverage from ocean edge down to the surging front's leading edge
5. Horizontal interpolation: at each pixel row, lerp depth between neighboring columns
6. Write RGBA coverage texture:
   - R = normalized depth (0..1, `depth / 9` clamped)
   - G = leading-edge flag (1.0 within ~3-4px of surging front, 0.0 elsewhere)
   - A = base coverage (1.0 = water, 0.0 = no water, gradient at horizontal edges)

**Expose segment data:** Add public `get col()` getter to `WaveSegment` returning `this.spawn.col`.

**Testable pure function:** Extract `buildCoverageData(segments, grid)` that returns `Uint8ClampedArray` of RGBA pixel data. Takes projected segment data (no Actor dependency) and grid dimensions.

**Tests:** `src/wave/wave-overlay.test.ts`
- Single surging segment at col 3, leading edge at row 2, depth 4: R > 0 in col 3 rows 0-2, G > 0 near leading edge pixels, A = 255 in covered region
- Two adjacent columns with different depths produce interpolated R values between them
- Empty segments array produces all-zero coverage
- Receding/still segments contribute coverage but G = 0 (no foam flag)

**Verify:** `node --run static-check`

---

## Task 2: GLSL fragment shader inline in the material

**File:** `src/wave/wave-overlay.ts`

Define `const WAVE_FRAGMENT_SOURCE` as a template string. Use the shader below verbatim.

Material creation in `onInitialize`:
```typescript
const material = engine.graphicsContext.createMaterial({
  name: 'wave-overlay',
  fragmentSource: WAVE_FRAGMENT_SOURCE,
  color: Color.fromRGB(60, 120, 220),
});
this.graphics.material = material;
```

### `WAVE_FRAGMENT_SOURCE`

```glsl
#version 300 es
precision mediump float;

uniform sampler2D u_graphic;
uniform float u_time_ms;
uniform vec4 u_color;
uniform float u_opacity;
uniform vec2 u_graphic_resolution;

in vec2 v_uv;
out vec4 fragColor;

// Simple hash-based noise for foam shimmer
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec4 tex = texture(u_graphic, v_uv);
    float depth = tex.r;       // normalized depth 0..1
    float edge  = tex.g;       // leading-edge flag
    float cover = tex.a;       // base coverage

    // Early discard for fully transparent pixels
    if (cover < 0.01) discard;

    float t = u_time_ms * 0.001; // seconds

    // --- Zone 3: Side/trailing edge alpha falloff ---
    // Soft fade where coverage drops off, but not at the foam front
    float edgeFade = smoothstep(0.0, 0.15, cover);
    // Only apply lateral fade where there's no leading edge
    float lateralFade = mix(edgeFade, 1.0, smoothstep(0.0, 0.3, edge));

    // --- Zone 2: Water body interior ---
    // Alpha ramps with depth: shallow ~0.2, deep ~0.85
    float bodyAlpha = mix(0.2, 0.85, depth);

    // Base water color from the material uniform
    vec3 waterColor = u_color.rgb;
    // Slightly lighten shallow areas for a natural look
    waterColor = mix(waterColor * 1.15, waterColor * 0.9, depth);

    // --- Zone 1: Leading edge foam fringe ---
    // Noise displacement for shimmer along the foam line
    vec2 pixelPos = v_uv * u_graphic_resolution;
    float noiseVal = hash(floor(pixelPos * 0.5) + floor(t * 3.0));
    float shimmer = sin(pixelPos.x * 0.8 + t * 4.0 + noiseVal * 6.28) * 0.3 + 0.7;

    // Foam intensity: strongest at the very front edge, fading behind
    float foam = smoothstep(0.0, 0.2, edge) * smoothstep(1.2, 0.4, edge);
    foam *= shimmer;

    // Foam color: bright white-cyan
    vec3 foamColor = vec3(0.85, 0.95, 1.0);

    // --- Composite ---
    vec3 rgb = mix(waterColor, foamColor, foam * 0.7);
    float alpha = bodyAlpha * lateralFade * u_opacity * cover;

    // Foam boosts alpha slightly so the fringe reads clearly
    alpha = min(1.0, alpha + foam * 0.3 * edge);

    // Pre-multiplied alpha output (Excalibur convention)
    fragColor = vec4(rgb * alpha, alpha);
}
```

**Verify:** `node --run static-check`

---

## Task 3: Wire `WaveOverlay` into `WaveActorRuntime`

**File:** `src/wave/wave-actor-runtime.ts`

1. Import `WaveOverlay`
2. Add `private overlay: WaveOverlay | null = null`
3. In `playWave()`, before creating segments: create `WaveOverlay` with grid params, add to scene
4. In `cleanup()`: remove overlay from scene, set to null
5. In `maybeResolve` (all segments dissipated): same cleanup

**Tests:** `src/wave/wave-actor-runtime.test.ts`
- "creates WaveOverlay on wave start and removes on cleanup"
- "overlay is removed when wave finishes (all segments dissipated)"

**Verify:** `node --run static-check`

---

## Task 4: Strip visual rendering from `WaveSegment`

**File:** `src/wave/wave-segment.ts`

Remove:
- `WATER_SPRITES` constant and `waterSpriteFor` function
- `waveSprite`, `puddleSprite` fields
- `updateVisualState()` method and all calls to it
- `updateGridVisibility()` method and all calls to it
- `beachSpriteSheet` import from `../resources.ts`
- Sprite setup in constructor (getSprite, clone, size assignment, graphics.use)
- `clone.graphics.opacity = 0` and `clone.actions.fade(...)` in `spawnStillClone`
- `this.actions.fade(0, 100).die()` in `finishRecession` -- replace with `this.kill()`

Add:
- `this.graphics.isVisible = false` in constructor
- `get col(): number { return this.spawn.col; }`

Keep: `depthAlpha` import (still used in `mergeWith`), `progressionAlpha` (used in `planWaveCells`/`replanFromRow`), all simulation/physics/event logic.

**Tests:** `src/wave/wave-segment.browser.test.ts`
- Remove tests about opacity and puddle sprites
- Add: "segment is invisible after construction"
- Keep all simulation/gameplay tests

**Verify:** `node --run static-check`

---

## Task 5: Manual visual verification

No code changes. Play in browser and verify:
- Continuous gradient across columns (no staircase)
- Foam fringe at leading edge with subtle shimmer
- Depth-based blue tint in water body
- Soft alpha falloff on side/trailing edges
- No surge/still seam
- Recession looks correct, overlay removed after wave completes
- Game events still fire (castle flooding, blocking, absorption)

Play at least one full level with multiple waves.

---

## Notes

- Still clones are spawned by segments directly onto the scene, not tracked by `WaveActorRuntime`. The overlay discovers them via `this.scene.actors.filter(a => a instanceof WaveSegment)`. Fine for the small actor count (~16 columns + a few clones each).
- Pixel coordinate mapping: `pixelX = segment.pos.x - gridLeft`, `pixelY = segment.pos.y - gridTop`.
- Coverage texture updates in `onPreUpdate`, which runs before the render pass. The `Canvas` graphic with `cache: false` calls its draw function during rendering, so the data is ready.
