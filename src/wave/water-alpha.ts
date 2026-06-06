const MIN_WAVE_ALPHA = 0.2;
const MAX_WAVE_ALPHA = 0.85;
const MIN_ALPHA_DEPTH = 1;
const MAX_ALPHA_DEPTH = 9;

export function depthAlpha(depth: number): number {
  const t = Math.min(
    Math.max((depth - MIN_ALPHA_DEPTH) / (MAX_ALPHA_DEPTH - MIN_ALPHA_DEPTH), 0),
    1,
  );
  return MIN_WAVE_ALPHA + t * (MAX_WAVE_ALPHA - MIN_WAVE_ALPHA);
}

export function progressionAlpha(step: number, totalSteps: number): number {
  if (totalSteps <= 1) {
    return MAX_WAVE_ALPHA;
  }

  const t = Math.min(Math.max(step / (totalSteps - 1), 0), 1);
  return MAX_WAVE_ALPHA + (MIN_WAVE_ALPHA - MAX_WAVE_ALPHA) * t;
}
