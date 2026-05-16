import { describe, it, expect } from 'vitest';
import { simulateAdvance, simulateWave, waveHeightForLevel, wavesForLevel } from './wave';
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

describe('simulateAdvance new outputs', () => {
  it('records survivedAtMaxRow per column for unblocked flow', () => {
    const flat3x3 = [[0,0,0],[0,0,0],[0,0,0]];
    const result = simulateAdvance({
      elevations: flat3x3,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    expect(result.survivedAtMaxRow).toEqual([1, 1, 1]);
  });

  it('records bounceBack when a wall fully blocks a column', () => {
    const grid = [
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0],
    ];
    const result = simulateAdvance({
      elevations: grid,
      columnHeights: [0, 1, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    // Column 1's wave (height 1) hits wall +2 at row 1 → blocked → bouncesBack at row 1.
    // survivedAtMaxRow[1] is the lateral-spread leak-back quirk (~0.04), matching the
    // existing baseline characterization in this file.
    expect(result.bounceBack[1][1]).toBe(1);
    expect(result.survivedAtMaxRow[1]).toBeCloseTo(0.04, 5);
  });

  it('records puddleDelta when a hole absorbs wave water', () => {
    const grid = [
      [0, 0, 0],
      [0, -3, 0],
      [0, 0, 0],
    ];
    const result = simulateAdvance({
      elevations: grid,
      columnHeights: [0, 2, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,3,0],[0,0,0]],
    });
    // Hole at (1,1) absorbs wave height 2 (capped at effective depth 3)
    expect(result.puddleDelta[1][1]).toBe(2);
  });

  it('records wallErosionEvents: overtopped vs blocked', () => {
    const grid = [
      [0, 0, 0],
      [2, 5, 0],  // col 0 has wall +2 (overtopped by wave 3), col 1 has wall +5 (blocks wave 3)
      [0, 0, 0],
    ];
    const result = simulateAdvance({
      elevations: grid,
      columnHeights: [3, 3, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
    });
    expect(result.wallErosionEvents[1][0]).toBe('overtopped');
    expect(result.wallErosionEvents[1][1]).toBe('blocked');
  });
});
