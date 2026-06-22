---
id: TASK-016
title: Naturalistic flowing water shader for wave overlay
status: Done
assignee: []
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
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the flat depth-tinted wave overlay with smooth HD flowing water: ripples that scroll along real sim velocity, fake lighting + specular sparkle, caustic light bands, and foam at both the leading edge and where water meets walls/towers. Overlay-only; no gameplay/sim changes.

Key engine constraint: Excalibur uploads textures with UNPACK_PREMULTIPLY_ALPHA_WEBGL=true (excalibur.development.js:10650), so any texel with alpha<255 has its RGB scaled down on upload. The alpha channel therefore cannot carry independent data (must stay 255 on wet pixels), leaving 3 usable RGB data channels in the single u_graphic texture Excalibur auto-feeds the material. New buffer layout: R=normalized depth, G=vx (signed, 128=0), B=vy (signed, 128=0), A=coverage mask (255 wet / 0 dry; dry pixels are discarded so premultiply zeroing them is harmless). Foam is no longer a buffer channel; it is computed in-shader from the velocity-field gradient, which produces turbulence automatically at the leading edge (wet velocity -> zero) and where flow shears against static walls/towers.

Decomposed into a behavior-preserving plumbing subtask (.01) and the visual feature subtask (.02) so every commit stays both test-green and visually coherent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No gameplay or wave-simulation behavior changes; only the overlay buffer encoding and fragment shader change
- [x] #2 node --run static-check passes
- [x] #3 Both subtasks committed atomically and the repo is test-green and visually coherent after each commit
- [x] #4 Wave overlay renders smooth flowing water (uniform-scroll FBM ripples, soft crest-gated specular, subtle caustics, depth tint from the #568AE4 tileset blue, fresnel edge, depth-based front foam) over the wave field
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Two ordered subtasks, each an atomic commit. task-016.01 is a behavior-preserving refactor (no visual change); task-016.02 is the visual upgrade. .02 depends on .01.

ORDER:
1. task-016.01 - Re-encode coverage buffer with velocity channels; move foam detection into the shader (no visual change).
2. task-016.02 - Rich flowing-water fragment shader (FBM flow, lighting/specular, caustics, obstacle foam, fresnel) + visual baseline.

KEY FILES:
- src/wave/water-field-coverage.ts (buffer encoding; drop CPU foam scan)
- src/wave/wave-render-system.ts (rasterize WaterComponent.vel into vx/vy grids)
- src/wave/wave-overlay.ts (WAVE_FRAGMENT_SOURCE rewrite)
- src/wave/water-field-coverage.test.ts (unit; new channel semantics)
- src/wave/wave-render-system.browser.test.ts (browser; velocity channels)
- new visual-baseline browser test

CHANNEL CONTRACT (shared by .01 and .02): R=depth (normalized /DEPTH_NORMALIZE), G=vx, B=vy (both signed: byte = 128 + clamp(v/VEL_ENCODE_SCALE,-1,1)*127), A=255 on wet / 0 on dry. Shader decodes vx,vy as ((channel/255)-0.5)*2*VEL_ENCODE_SCALE. Bilinearly sample vx/vy exactly like depth.

VERIFY: node --run static-check after each subtask.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Velocity-aligned design (.01/.02) was implemented and committed, then superseded: per-pixel velocity in the shader caused resolution-dependent artifacts. Final build is depth-only; velocity plumbing stripped. WaterComponent.vel still exists for the sim, just unused by the renderer.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped a naturalistic flowing-water shader for the wave overlay. Final design is DEPTH-ONLY, which differs from the original velocity-aligned plan: the velocity-aligned approach (.01 velocity channels, .02 flow-advected ripples + velocity-gradient obstacle foam) was implemented but each velocity-driven mechanism produced rendering artifacts at play resolution (velocity*time advection -> streaks; flowmap crossfade -> concentric-ring moire; static velocity warp -> divergence stripes; velocity-gradient foam -> top-band cross-hatch mesh). All were traced to feeding per-pixel velocity into the shader against a fixed 256x304 texture that pixel-art nearest-upscales to the window. Resolution: drop velocity from the render path entirely.

Final pipeline:
- Coverage buffer (water-field-coverage.ts): R=normalized depth, A=coverage mask (G/B unused). Velocity channels/encodeVel removed; WaveRenderSystem builds only the depth grid.
- Shader (wave-overlay.ts): uniform downstream scroll FBM ripples (no per-pixel velocity manipulation), normal-based soft specular gated to ripple crests, subtle caustics, depth tint from base color Color.fromHex(#568AE4) (tileset water blue), fresnel shallow-edge rim, depth-based front-foam cap, coverage-keyed alpha (shallow interior water stays solid -> no water/no-water/water banding). Overlay Canvas uses ImageFiltering.Blended.
- Tests: wave-field-visual-baseline renders at a game-sized viewport (1400x1750) with a structured wave (hole + non-uniform source) so it reproduces play-scale artifacts; coverage + render-system tests updated to the depth-only contract.

No gameplay/sim changes. node --run static-check green.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `node --run static-check` passes
<!-- DOD:END -->
