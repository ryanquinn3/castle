import { describe, it, expect } from 'vitest';
import { simulateWave, waveHeightForLevel, wavesForLevel } from './wave';
import { WAVE_HEIGHT_START, WAVE_HEIGHT_INCREMENT, WAVES_BASE, WAVES_INCREMENT } from './config';

describe('waveHeightForLevel', () => {
  it('returns WAVE_HEIGHT_START on level 1', () => {
    expect(waveHeightForLevel(1)).toBe(WAVE_HEIGHT_START);
  });

  it('adds WAVE_HEIGHT_INCREMENT per level above 1', () => {
    expect(waveHeightForLevel(3)).toBe(WAVE_HEIGHT_START + 2 * WAVE_HEIGHT_INCREMENT);
  });
});

describe('wavesForLevel', () => {
  it('returns WAVES_BASE on level 1', () => {
    expect(wavesForLevel(1)).toBe(WAVES_BASE);
  });

  it('adds WAVES_INCREMENT per level above 1', () => {
    expect(wavesForLevel(4)).toBe(WAVES_BASE + 3 * WAVES_INCREMENT);
  });
});

describe('simulateWave (current behavior)', () => {
  // 3x3 grid, castle at (1, 2), wave height 1, terrain slope 0 for simplicity
  const flat3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  it('flat grid: wave passes every row at full height', () => {
    const result = simulateWave(flat3x3, [1, 1, 1], 1, 2, 3, 0);
    expect(result.waveHeightMap[0]).toEqual([1, 1, 1]);
    expect(result.waveHeightMap[2]).toEqual([1, 1, 1]);
  });

  it('flat grid: wave at castle column floods castle', () => {
    const result = simulateWave(flat3x3, [1, 1, 1], 1, 2, 3, 0);
    expect(result.castleFlooded).toBe(true);
  });

  it('wall taller than wave: column blocked, no flood', () => {
    const grid = [
      [0, 2, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const result = simulateWave(grid, [0, 1, 0], 1, 2, 3, 0);
    expect(result.waveHeightMap[2][1]).toBe(0);
    expect(result.castleFlooded).toBe(false);
  });

  it('hole deeper than wave: column absorbed in main flow, but lateral spread leaks back (current behavior)', () => {
    const grid = [
      [0, 0, 0],
      [0, -2, 0],
      [0, 0, 0],
    ];
    const result = simulateWave(grid, [0, 1, 0], 1, 2, 3, 0);
    // Hole absorbs the column's main flow, but lateral spread from neighbours
    // bleeds back into the column on the next row's spread step.
    // 0.04 = 0.2 (spread to neighbour) * 0.2 (spread back) * 2 neighbours/2 (max not sum).
    // Castle flood triggers because any > 0 height in the castle cell counts.
    expect(result.waveHeightMap[2][1]).toBeCloseTo(0.04, 5);
    expect(result.castleFlooded).toBe(true);
  });

  it('partial wall: wave continues at reduced height', () => {
    const grid = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const result = simulateWave(grid, [0, 3, 0], 3, 2, 3, 0);
    // Row 0 enters at 3, hits wall +1 at row 1 → continues at 2
    expect(result.waveHeightMap[2][1]).toBe(2);
  });
});
