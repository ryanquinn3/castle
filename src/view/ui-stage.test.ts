import { describe, it, expect } from 'vitest';
import { stageScale } from './ui-stage.ts';

describe('stageScale', () => {
  it('returns 1 when canvas CSS width equals stage width', () => {
    expect(stageScale(256, 256)).toBe(1);
  });

  it('returns 2 when canvas CSS width is double the stage width', () => {
    expect(stageScale(512, 256)).toBe(2);
  });

  it('returns 0.5 when canvas CSS width is half the stage width', () => {
    expect(stageScale(128, 256)).toBe(0.5);
  });

  it('uses STAGE_WIDTH as default when stageWidth not provided', () => {
    // STAGE_WIDTH = GRID_WIDTH * TILE_SIZE = 16 * 16 = 256
    expect(stageScale(256)).toBe(1);
    expect(stageScale(512)).toBe(2);
  });

  it('returns 1 when stageWidth is 0 to avoid division by zero', () => {
    expect(stageScale(100, 0)).toBe(1);
  });

  it('handles fractional scale values', () => {
    expect(stageScale(384, 256)).toBeCloseTo(1.5);
  });
});
