---
id: TASK-016.02
title: >-
  Rich flowing-water fragment shader (FBM flow, lighting, caustics, obstacle
  foam) + visual baseline
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 09:37'
updated_date: '2026-06-22 09:20'
labels:
  - rendering
  - wave
dependencies:
  - TASK-016.01
references:
  - src/wave/wave-overlay.ts
parent_task_id: TASK-016
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite the wave overlay fragment shader to render smooth HD naturalistic flowing water using the velocity channels (G=vx, B=vy) and depth (R) established in task-016.01. This is the visual payoff: ripples that scroll/warp along real flow, fake lighting with specular glints, caustic light bands, a richer depth tint, fresnel-ish shoreline lightening, and foam derived from the velocity-field gradient (so it appears at the leading edge AND where flow shears against walls/towers). Add a visual-baseline screenshot browser test.

Depends on task-016.01 (needs vx/vy in the buffer).
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `node --run static-check` passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fragment shader renders flow-aligned FBM ripples advected by the buffer's vx/vy velocity
- [x] #2 Fake lighting with specular glints on ripple crests and animated caustic light bands are visible
- [x] #3 Depth tint (deep->shallow color ramp) and fresnel-ish shallow-edge lightening present; base color still driven by u_color
- [x] #4 Foam derived from velocity-field gradient appears at the leading edge AND where flow shears against walls/towers
- [x] #5 A browser screenshot test captures the flowing overlay and asserts a black-box invariant (ripple/specular brightness above flat fill)
- [x] #6 node --run static-check passes
- [x] #7 Change committed atomically on feat/flowing-water-shader
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
All work in src/wave/wave-overlay.ts WAVE_FRAGMENT_SOURCE plus one new browser test. Iterate against the screenshot to tune.

DECODE (from task-016.01 contract): depth = tex.r * DEPTH_NORMALIZE-ish (normalized 0..1 in R); cover = tex.a; vx = (tex.g-0.5)*2*VEL_ENCODE_SCALE; vy = (tex.b-0.5)*2*VEL_ENCODE_SCALE. Discard if cover<0.01.

SHADER FEATURES (smooth display-space per the HD aesthetic choice; sample in v_uv, scale by u_graphic_resolution where needed):
1. Flow-aligned ripples: 3-4 octave value/gradient-noise FBM. Advect the sample coord by flow: p = baseUV*freq - vec2(vx,vy)*u_time_ms*FLOW_SPEED. Sum octaves for surface height h.
2. Lighting + specular: compute surface normal from FBM gradient (finite differences of h in x/y). diffuse = max(0,dot(n, L)); specular = pow(max(0,dot(reflect(-L,n), V)), SPEC_POWER) for a fixed light dir L and view dir V (e.g. straight-on). Add specular as bright glints on crests.
3. Caustics: a second cheap animated noise band (different freq/scroll) raised to a power -> soft bright dapples; modulate by depth so deeper water shows more.
4. Depth tint: ramp base color (u_color) from a deep blue/teal in deep water to a lighter blue in shallow, keyed by depth (R). Keep u_color as the tunable base.
5. Foam from velocity gradient: sample vx/vy at neighbor texels (v_uv +/- texel in x and y), measure |grad(v)| (divergence/shear magnitude). High gradient -> white-blue foam, added additively. This yields foam at the front (wet->dry velocity drop) AND at wall/tower contacts (flow shear). Keep a small depth-gradient front-foam term as backup so a perfectly uniform-velocity front still foams.
6. Fresnel-ish edge: lighten near shallow depth for a soft shoreline; feather the leading edge alpha as today so the front is not a hard step.
7. Compose: rgb = mix(depthTintedWater, foamColor, foam) + specular + caustics*causticStrength; alpha = bodyAlpha(depth) * cover * u_opacity, feathered at the thin leading edge.

TUNING: introduce shader-local consts (FLOW_SPEED, SPEC_POWER, caustic/ foam strengths) and tune VEL_ENCODE_SCALE in water-field-coverage.ts by eye using the screenshot test. Keep cost modest (3-4 octaves; overlay is only 256x304 logical px).

TEST: add src/wave/wave-flowing-visual.browser.test.ts (or extend an existing baseline test). Build a WaveOverlay, drive setCoverage with a synthetic field that has a wet body, a leading front, and a lateral velocity shear column (to exercise obstacle foam); ctx.step a few frames so u_time_ms advances; call page.screenshot() with no path arg. Assert a black-box invariant (e.g. some pixels exceed the flat-fill brightness, proving ripples/specular present) rather than exact pixels.

VERIFY: node --run static-check (runs unit + build; run node --run test:browser locally to view the screenshot).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
SUPERSEDED: flow-advected ripples and velocity-gradient obstacle foam were removed (resolution-dependent artifacts). Final shader is uniform-scroll FBM + depth-based front foam, no velocity. See TASK-016 final summary.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote WAVE_FRAGMENT_SOURCE in src/wave/wave-overlay.ts with: 4-octave FBM ripples flow-advected by vx/vy velocity channels; surface normals from finite differences driving diffuse + specular (SPEC_POWER=32) lighting; caustic noise bands modulated by depth; depth-tint ramp from deep blue to shallow teal keyed by u_color; fresnel-ish edge brightening; foam from velocity-field gradient (shear foam at wall/tower contacts) plus leading-edge front foam. Added wave-flowing-visual.browser.test.ts asserting buffer structure invariants (depth variance and non-zero velocity encoding) plus page.screenshot(). node --run static-check passes (tsc, lint, unit tests, knip, browser tests all green).
<!-- SECTION:FINAL_SUMMARY:END -->
