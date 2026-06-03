# Wall swatch assets

Date: 2026-06-02

## Goal

Replace runtime wall texture cropping with committed swatch images. The current renderer builds a `64x64` texture by cropping the shaped `wall-level-1..4.png` sprites in `getWallSwatch()`. That works, but it pulls in shape artifacts from the source art and makes the texture source hard to tune.

The new setup should keep the wall mass renderer the same while moving texture preparation into a repeatable tool.

## Scope

In scope:

- Generate clean wall texture swatches ahead of time.
- Commit `public/images/wall-swatch-1.png` through `wall-swatch-4.png`.
- Load those swatches directly at runtime.
- Keep the generator in `tools/`.
- Use `128x128` swatches to reduce obvious repetition across large wall masses.

Out of scope:

- Redesigning the tier visual language.
- Changing wall connectivity, bevels, outlines, rounded corners, or cache keys.
- Replacing the per-tile custom draw architecture.

## Asset flow

Add `tools/generate-wall-swatches.py`. It reads the existing `public/images/wall-level-1.png` through `wall-level-4.png` files and writes one clean texture per tier:

```text
public/images/wall-level-1.png -> public/images/wall-swatch-1.png
public/images/wall-level-2.png -> public/images/wall-swatch-2.png
public/images/wall-level-3.png -> public/images/wall-swatch-3.png
public/images/wall-level-4.png -> public/images/wall-swatch-4.png
```

Each tier gets a hand-tuned crop rectangle in the script. The rectangles should sample only interior material texture, avoiding transparent pixels, silhouette edges, bevels, shadows, and other shape-specific detail.

The default output path is simple: crop, resize to `128x128`, save. Use nearest-neighbor resizing to stay consistent with the current pixel-art rendering.

## Optional polish

The generator can include optional cleanup knobs, but they should start disabled unless the output is clearly better:

- Offset-and-blend seam cleanup, useful if the texture edge repeats too visibly.
- Edge mirroring or patching, useful if one side of a crop has a strong discontinuity.
- Small contrast or palette normalization, useful if a tier crop comes out muddy.

These should live in the generator, not runtime code. The app should only consume finished swatch images.

## Runtime changes

`src/resources.ts` should add and preload `WallSwatch1` through `WallSwatch4`.

`src/model/terrain.ts` should stop cropping from `WallLevel1..4` inside `getWallSwatch()`. Keep the function as a small cache that returns a `128x128` canvas copied from the loaded swatch resource. This preserves the current `CanvasPattern` path and keeps the runtime change narrow.

Update the pattern phase size from `64` to `128` so grid-anchored repetition still lines up across tiles.

Everything else in wall drawing stays as-is: exposed-edge logic, bevels, outlines, rounded corners, fallback fill, and cache keys.

## Verification

- Run the generator and inspect the four output swatches.
- Run `node --run build` to catch asset/resource type errors.
- Run `node --run test:unit` to catch model or rendering regressions covered by unit tests.
- Expect visual baselines to change because the wall texture source changes intentionally.

## Notes

The existing `wall-level-1..4.png` files remain useful as generator input. The old runtime crop constants become unnecessary once the swatches are committed.
