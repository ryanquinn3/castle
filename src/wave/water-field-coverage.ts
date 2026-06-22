const DEPTH_NORMALIZE = 9;

export interface FieldCoverageInput {
  /** Water depth per cell, indexed [row][col]; 0 where dry. */
  depths: number[][];
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
}

/**
 * Rasterize a 2D depth field into the wave overlay's RGBA buffer, bilinearly
 * sampling cell-center depth for a smooth surface.
 *
 * Channel layout (Excalibur premultiplied-alpha safe: A must be 255 on wet pixels):
 *   R = normalized depth (0..255 maps to 0..DEPTH_NORMALIZE)
 *   G, B = unused (0)
 *   A = 255 wet / 0 dry
 *
 * The buffer is (gridHeight + 1) rows tall; grid row r occupies pixel band r+1
 * (the top band is the ocean row above the grid). The shader derives ripples
 * (uniform scroll) and front foam (depth gradient) from R/A alone.
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

  for (let py = 0; py < pixelH; py++) {
    for (let px = 0; px < pixelW; px++) {
      const depth = depthAtPixel(px, py);
      if (depth <= 0) {
        continue;
      }

      const idx = (py * pixelW + px) * 4;
      data[idx] = Math.round(Math.min(depth / DEPTH_NORMALIZE, 1) * 255); // R = depth
      data[idx + 3] = 255; // A = wet
    }
  }

  return data;
}
