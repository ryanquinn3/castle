/** Format a number for display in the info panel. Omits decimal for integers. */
export function fmtNum(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function elevationToColor(elevation: number): { r: number; g: number; b: number } {
  if (elevation === 0) {
    return { r: 210, g: 180, b: 140 };
  }
  if (elevation > 0) {
    if (elevation <= 5) {
      const t = (elevation - 1) / 4;
      return {
        r: lerpChannel(195, 160, t),
        g: lerpChannel(150, 110, t),
        b: lerpChannel(85, 50, t),
      };
    } else {
      const t = (elevation - 5) / 5;
      return {
        r: lerpChannel(160, 100, t),
        g: lerpChannel(110, 65, t),
        b: lerpChannel(50, 20, t),
      };
    }
  }
  const depth = -elevation;
  if (depth <= 5) {
    const t = (depth - 1) / 4;
    return {
      r: lerpChannel(130, 80, t),
      g: lerpChannel(105, 60, t),
      b: lerpChannel(75, 40, t),
    };
  } else {
    const t = (depth - 5) / 5;
    return {
      r: lerpChannel(80, 40, t),
      g: lerpChannel(60, 30, t),
      b: lerpChannel(40, 20, t),
    };
  }
}
