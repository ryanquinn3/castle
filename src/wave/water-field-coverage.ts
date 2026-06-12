const DEPTH_NORMALIZE = 9;
const FOAM_DEPTH_SCALE = 2;

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

  for (let py = 0; py < pixelH; py++) {
    const gy = py / tileSize - 1 - 0.5; // fractional grid row at cell centers
    const r0 = Math.floor(gy);
    const ty = gy - r0;
    for (let px = 0; px < pixelW; px++) {
      const gx = px / tileSize - 0.5;
      const c0 = Math.floor(gx);
      const tx = gx - c0;

      const top = depthAt(c0, r0) * (1 - tx) + depthAt(c0 + 1, r0) * tx;
      const bot = depthAt(c0, r0 + 1) * (1 - tx) + depthAt(c0 + 1, r0 + 1) * tx;
      const depth = top * (1 - ty) + bot * ty;
      if (depth <= 0) {
        continue;
      }

      const foam = Math.max(0, Math.min(1, (depth - bot) / FOAM_DEPTH_SCALE));
      const idx = (py * pixelW + px) * 4;
      data[idx] = Math.round(Math.min(depth / DEPTH_NORMALIZE, 1) * 255);
      data[idx + 1] = Math.round(foam * 255);
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  return data;
}
