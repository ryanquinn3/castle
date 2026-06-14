const DEPTH_NORMALIZE = 9;
/**
 * Foam band thickness in pixels at the leading wet edge. Mirrors the legacy
 * `FOAM_PIXELS` in wave-overlay.ts so field water foams the same way: a thin
 * crest at the front, nothing in the body.
 */
const FOAM_PIXELS = 4;
/** A pixel whose bilinear depth is at or below this counts as dry/ahead. */
const FRONT_DRY_DEPTH = 0.5;

export interface FieldCoverageInput {
  /** Water depth per cell, indexed [row][col]; 0 where dry. */
  depths: number[][];
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
}

/**
 * Rasterize a 2D depth field into the wave overlay's RGBA buffer, bilinearly
 * sampling cell-center depths for a smooth surface. Channels match the overlay
 * shader: R = normalized depth, G = front foam, B = coverage, A = alpha. The
 * buffer is (gridHeight + 1) rows tall; grid row r occupies pixel band r+1 (the
 * top band is the ocean row above the grid).
 */
export function buildFieldCoverageData(input: FieldCoverageInput): Uint8ClampedArray {
  const { depths, gridWidth, gridHeight, tileSize } = input;
  const pixelW = gridWidth * tileSize;
  const pixelH = (gridHeight + 1) * tileSize;
  const data = new Uint8ClampedArray(pixelW * pixelH * 4);

  const depthAt = (col: number, row: number): number => {
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) {
      return 0;
    }
    return depths[row][col];
  };

  // Bilinear depth at an arbitrary pixel (px, py). px/py are in overlay pixel
  // space; the +1 ocean band offset is folded into the fractional grid row.
  const depthAtPixel = (px: number, py: number): number => {
    const gy = py / tileSize - 1 - 0.5;
    const r0 = Math.floor(gy);
    const ty = gy - r0;
    const gx = px / tileSize - 0.5;
    const c0 = Math.floor(gx);
    const tx = gx - c0;
    const top = depthAt(c0, r0) * (1 - tx) + depthAt(c0 + 1, r0) * tx;
    const bot = depthAt(c0, r0 + 1) * (1 - tx) + depthAt(c0 + 1, r0 + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };

  // Distance (in pixels) from a wet pixel to the leading dry edge directly
  // downstream (+y). Returns Infinity if the body stays wet for the whole
  // foam band, so only true front pixels foam. Mirrors legacy `distFromFront`.
  const distToFront = (px: number, py: number): number => {
    for (let ahead = 1; ahead <= FOAM_PIXELS; ahead++) {
      if (depthAtPixel(px, py + ahead) <= FRONT_DRY_DEPTH) {
        return ahead - 1;
      }
    }
    return Number.POSITIVE_INFINITY;
  };

  for (let py = 0; py < pixelH; py++) {
    for (let px = 0; px < pixelW; px++) {
      const depth = depthAtPixel(px, py);
      if (depth <= 0) {
        continue;
      }

      const idx = (py * pixelW + px) * 4;
      data[idx] = Math.round(Math.min(depth / DEPTH_NORMALIZE, 1) * 255);

      const distFromFront = distToFront(px, py);
      if (distFromFront < FOAM_PIXELS) {
        const foamIntensity = 1 - distFromFront / FOAM_PIXELS;
        data[idx + 1] = Math.round(foamIntensity * 255);
      }

      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  return data;
}
