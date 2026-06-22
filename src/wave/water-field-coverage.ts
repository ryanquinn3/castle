const DEPTH_NORMALIZE = 9;

export interface FieldCoverageInput {
  /** Water depth per cell, indexed [row][col]; 0 where dry. */
  depths: number[][];
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
  /**
   * Baseline depth for the virtual ocean rows above the grid (row < 0). Fills
   * the top ocean band with standing water so the surge appears to flow in from
   * the sea rather than starting at the beach. 0 leaves the band dry.
   */
  oceanDepth: number;
}

/**
 * Rasterize a 2D depth field into the wave overlay's RGBA buffer, bilinearly
 * sampling cell-center depth for a smooth surface.
 *
 * Channel layout (Excalibur premultiplied-alpha safe: A must be 255 on wet pixels):
 *   R = normalized depth (0..255 maps to 0..DEPTH_NORMALIZE)
 *   G = opaque-ocean weight (255 = force full opacity, for the top ocean band)
 *   B = unused (0)
 *   A = 255 wet / 0 dry
 *
 * The buffer is (gridHeight + 1) rows tall; grid row r occupies pixel band r+1
 * (the top band is the ocean row above the grid). The shader derives ripples
 * (uniform scroll) and front foam (depth gradient) from R/A alone.
 */
export function buildFieldCoverageData(input: FieldCoverageInput): Uint8ClampedArray {
  const { depths, gridWidth, gridHeight, tileSize, oceanDepth } = input;
  const pixelW = gridWidth * tileSize;
  const pixelH = (gridHeight + 1) * tileSize;
  const data = new Uint8ClampedArray(pixelW * pixelH * 4);

  const depthAt = (col: number, row: number): number => {
    if (col < 0 || col >= gridWidth || row >= gridHeight) {
      return 0;
    }
    // Rows above the grid are open ocean: a standing baseline that bilinearly
    // blends down into grid row 0.
    if (row < 0) {
      return oceanDepth;
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

  for (let py = 0; py < pixelH; py++) {
    // Opaque-ocean weight for this pixel row: the top band (above grid row 0)
    // renders as solid sea. Hold full opacity across the band, then ease to 0
    // at the beach line so it blends into grid row 0 without a hard seam.
    const oceanWeight = oceanBandWeight(py, tileSize);
    for (let px = 0; px < pixelW; px++) {
      const depth = depthAtPixel(px, py);
      if (depth <= 0) {
        continue;
      }

      const idx = (py * pixelW + px) * 4;
      data[idx] = Math.round(Math.min(depth / DEPTH_NORMALIZE, 1) * 255); // R = depth
      if (oceanWeight > 0) {
        data[idx + 1] = Math.round(oceanWeight * 255); // G = opaque ocean
      }
      data[idx + 3] = 255; // A = wet
    }
  }

  return data;
}

// Opaque-ocean weight as a function of pixel row: 1 across the top of the ocean
// band, easing linearly to 0 at the beach line (py = tileSize) and below.
function oceanBandWeight(py: number, tileSize: number): number {
  if (py >= tileSize) {
    return 0;
  }
  const HOLD = 0.6; // fraction of the band held at full opacity before easing
  const t = py / tileSize; // 0 at the top edge, 1 at the beach line
  if (t <= HOLD) {
    return 1;
  }
  return 1 - (t - HOLD) / (1 - HOLD);
}
