---
id: TASK-016.01
title: >-
  Re-encode coverage buffer with velocity channels; move foam detection into
  shader
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 09:36'
updated_date: '2026-06-22 09:20'
labels:
  - rendering
  - wave
dependencies: []
references:
  - src/wave/water-field-coverage.ts
  - src/wave/wave-render-system.ts
  - src/wave/wave-overlay.ts
parent_task_id: TASK-016
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Behavior-preserving refactor: change the overlay buffer's channel layout to carry per-cell velocity, and relocate front-foam detection from CPU (water-field-coverage.ts) into the fragment shader, deriving it from the depth gradient. The on-screen water must look essentially unchanged after this subtask -- this is plumbing only. The rich flowing look is added in task-016.02.

WHY: The new velocity-aligned shader (.02) needs vx/vy per cell. With Excalibur's premultiplied-alpha upload, only R/G/B can hold data (alpha must stay 255 on wet pixels). Freeing the G channel (currently CPU front-foam) for vx, and adding vy in B, requires moving foam into the shader. Doing the encoding swap and the equivalent in-shader foam together keeps the visual unchanged and every commit coherent.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Coverage buffer encodes R=depth, G=vx, B=vy (signed via VEL_ENCODE_SCALE, 128=zero), A=255 wet / 0 dry; CPU foam scan (FOAM_PIXELS/FRONT_DRY_DEPTH/distToFront) removed
- [x] #2 WaveRenderSystem rasterizes WaterComponent.vel into vx/vy grids passed to buildFieldCoverageData
- [x] #3 Fragment shader derives front foam from the depth gradient (not the G channel) and the on-screen water looks unchanged vs before this subtask
- [x] #4 water-field-coverage.test.ts asserts the new R/G/B/A channel semantics; wave-render-system.browser.test.ts asserts velocity reaches the buffer (vel=(1,0) -> G>128)
- [x] #5 node --run static-check passes
- [x] #6 Change committed atomically on feat/flowing-water-shader
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
TDD where practical; data layer is unit-testable, shader change verified by the existing browser test staying green.

1. src/wave/water-field-coverage.ts:
   - Add export const VEL_ENCODE_SCALE = 2.0 (tunable; see note). Add a signed-byte encoder: encodeVel(v) => round((128 + clamp(v / VEL_ENCODE_SCALE, -1, 1) * 127)).
   - Extend FieldCoverageInput with velX: number[][] and velY: number[][] (same [row][col] shape as depths).
   - In buildFieldCoverageData add bilinear samplers velXAtPixel/velYAtPixel mirroring depthAtPixel (same +1 ocean-band row offset, same clamping-to-0 outside grid).
   - For each WET pixel (depth>0): R = round(min(depth/DEPTH_NORMALIZE,1)*255); G = encodeVel(velX); B = encodeVel(velY); A = 255. For DRY pixels leave all four channels 0 (coverage mask).
   - Delete the CPU foam path: FOAM_PIXELS, FRONT_DRY_DEPTH, distToFront, and the G-channel foam write. (Foam now lives in the shader.)

2. src/wave/wave-render-system.ts:
   - Build velX and velY grids alongside depths from each WaterComponent (w.vel.x -> velX[row][col], w.vel.y -> velY[row][col]); pass them into buildFieldCoverageData.

3. src/wave/wave-overlay.ts (WAVE_FRAGMENT_SOURCE):
   - Stop reading G as foam. Read depth from R and coverage from A (discard if A<0.01 or depth<=0).
   - Reproduce the existing front foam in-shader from the DEPTH gradient: sample depth one+ texel downstream (v_uv + vec2(0, k/u_graphic_resolution.y)); foam where here is wet and downstream depth is ~0 (mirror old FRONT_DRY_DEPTH/FOAM_PIXELS feel). Keep the current body-alpha ramp, depth tint, shimmer so the look is unchanged.
   - Do NOT yet use vx/vy (G/B) -- that is task-016.02.

4. Tests:
   - src/wave/water-field-coverage.test.ts: keep depth(R)+alpha tests. Replace the foam(G) test with: G/B encode velocity (zero velocity -> ~128; positive velX -> G>128; negative -> G<128), bilinearly interpolated; A=255 on wet, 0 on dry.
   - src/wave/wave-render-system.browser.test.ts: keep maxAlpha>0; add that a WaterComponent with vel=(1,0) yields G>128 over its cell (velocity reaches the buffer).

NOTE on VEL_ENCODE_SCALE: sim velocity is net flux (settle epsilon 0.02; PRESSURE_FLUX_COEFF 0.18). 2.0 is a starting point; .02 tunes it by eye against the visual baseline. It only affects ripple/foam strength, not gameplay.

VERIFY: node --run static-check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
SUPERSEDED: the velocity channels (G=vx, B=vy) added here were later stripped. Per-pixel velocity in the shader caused artifacts; final buffer is depth (R) + coverage (A) only. See TASK-016 final summary.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Re-encoded wave overlay buffer: R=depth, G=vx, B=vy (signed, 128=zero via VEL_ENCODE_SCALE=2.0), A=255 wet/0 dry. Deleted CPU foam scan (FOAM_PIXELS, FRONT_DRY_DEPTH, distToFront). WaveRenderSystem now builds velX/velY grids from WaterComponent.vel and passes them to buildFieldCoverageData. Fragment shader derives front foam from downstream depth gradient (4-texel look-ahead), preserving the visual look. Tests updated: encodeVel unit tests, new G/B channel semantic tests in water-field-coverage.test.ts, new vel=(1,0) -> G>128 assertion in wave-render-system.browser.test.ts. node --run static-check passes (tsc, lint, unit_test, knip, browser_test all green). Committed atomically on feat/flowing-water-shader.
<!-- SECTION:FINAL_SUMMARY:END -->
