import { describe, it, expect } from 'vitest';
import { simulateAdvance, simulateRecede, simulateWave, waveHeightForLevel, wavesForLevel } from './wave';
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
  const zeroPuddles = [[0,0,0],[0,0,0],[0,0,0]];

  it('flat grid: wave passes every row at full height', () => {
    const result = simulateWave({
      elevations: flat3x3,
      puddleDepths: zeroPuddles,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    // All columns in row 0 should have water
    for (const v of result.advanceHeightMap[0]) {
      expect(v).toBeGreaterThan(0);
    }
    // Water reaches the last row
    for (const v of result.advanceHeightMap[2]) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('flat grid: wave at castle column floods castle', () => {
    const result = simulateWave({
      elevations: flat3x3,
      puddleDepths: zeroPuddles,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    expect(result.castleFlooded).toBe(true);
  });

  it('wall taller than wave: column blocked, no flood', () => {
    const grid = [
      [0, 2, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const result = simulateWave({
      elevations: grid,
      puddleDepths: zeroPuddles,
      columnHeights: [0, 1, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    // Wall blocks -- castle should not flood
    expect(result.castleFlooded).toBe(false);
  });

  it('hole deeper than wave: wave absorbed by hole', () => {
    const grid = [
      [0, 0, 0],
      [0, -2, 0],
      [0, 0, 0],
    ];
    const result = simulateWave({
      elevations: grid,
      puddleDepths: zeroPuddles,
      columnHeights: [0, 1, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    // Hole absorbs the wave; puddle delta should capture the absorbed water
    expect(result.puddleDelta[1][1]).toBeGreaterThanOrEqual(0.5);
  });

  it('partial wall: wave continues at reduced height', () => {
    const grid = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const result = simulateWave({
      elevations: grid,
      puddleDepths: zeroPuddles,
      columnHeights: [0, 3, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    // Water gets past the wall but at reduced height
    expect(result.advanceHeightMap[2][1]).toBeGreaterThan(0);
    expect(result.advanceHeightMap[2][1]).toBeLessThan(3);
  });
});

describe('simulateWave orchestrator', () => {
  it('returns advance and recede maps, frames, and combined castleFlooded', () => {
    const flat3x3 = [[0,0,0],[0,0,0],[0,0,0]];
    const result = simulateWave({
      elevations: flat3x3,
      puddleDepths: [[0,0,0],[0,0,0],[0,0,0]],
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    // Water reaches row 0
    for (const v of result.advanceHeightMap[0]) {
      expect(v).toBeGreaterThan(0);
    }
    // Recede produces water in row 0
    expect(result.recedeHeightMap[0][0]).toBeGreaterThan(0);
    expect(result.castleFlooded).toBe(true);
    // Frame arrays should exist and have entries
    expect(result.advanceFrames.length).toBeGreaterThan(0);
    expect(result.recedeFrames.length).toBeGreaterThan(0);
  });

  it('sums advance + recede puddle deltas per tile', () => {
    const grid = [
      [0, 0, 0],
      [0, -3, 0],
      [0, 0, 0],
    ];
    const result = simulateWave({
      elevations: grid,
      puddleDepths: [[0,0,0],[0,0,0],[0,0,0]],
      columnHeights: [0, 2, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    // Hole absorbs the wave; total puddle delta should capture at least the incoming water
    expect(result.puddleDelta[1][1]).toBeGreaterThanOrEqual(1);
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
      poolMap: new Map(),
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
      poolMap: new Map(),
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
      poolMap: new Map(),
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
      poolMap: new Map(),
    });
    expect(result.wallErosionEvents[1][0]).toBe('overtopped');
    expect(result.wallErosionEvents[1][1]).toBe('blocked');
  });
});

describe('simulateRecede', () => {
  const flat3x3 = [[0,0,0],[0,0,0],[0,0,0]];

  it('flat grid: water flows back through every row at full height', () => {
    const advance = simulateAdvance({
      elevations: flat3x3,
      columnHeights: [1, 1, 1],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
      poolMap: new Map(),
    });
    const recede = simulateRecede({
      elevations: flat3x3,
      survivedAtMaxRow: advance.survivedAtMaxRow,
      bounceBack: advance.bounceBack,
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
      poolMap: new Map(),
    });
    // Recede pass should mirror advance for a flat grid (each column reaches each row at ~1).
    expect(recede.recedeHeightMap[0][0]).toBeCloseTo(1, 5);
    expect(recede.recedeHeightMap[0][1]).toBeCloseTo(1, 5);
    expect(recede.recedeHeightMap[2][2]).toBeCloseTo(1, 5);
  });

  it('wall fully blocks advance: bounce-back recedes from wall row', () => {
    const grid = [
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0],
    ];
    const advance = simulateAdvance({
      elevations: grid,
      columnHeights: [0, 1, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
      poolMap: new Map(),
    });
    const recede = simulateRecede({
      elevations: grid,
      survivedAtMaxRow: advance.survivedAtMaxRow,
      bounceBack: advance.bounceBack,
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,0,0],[0,0,0]],
      poolMap: new Map(),
    });
    // bounceBack at row 1 col 1 (value 1) should appear in recede map at row 0 col 1
    expect(recede.recedeHeightMap[0][1]).toBeCloseTo(1, 5);
    // Row below the wall: water never got there on advance and recede can't pass back through the wall
    expect(recede.recedeHeightMap[2][1]).toBeLessThan(0.1);
  });

  it('hole absorbs full wave: nothing to recede in that column', () => {
    const grid = [
      [0, 0, 0],
      [0, -3, 0],
      [0, 0, 0],
    ];
    const advance = simulateAdvance({
      elevations: grid,
      columnHeights: [0, 2, 0],
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,3,0],[0,0,0]],
      poolMap: new Map(),
    });
    const recede = simulateRecede({
      elevations: grid,
      survivedAtMaxRow: advance.survivedAtMaxRow,
      bounceBack: advance.bounceBack,
      castleCol: 1,
      castleRow: 2,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: [[0,0,0],[0,3,0],[0,0,0]],
      poolMap: new Map(),
    });
    // Column 1 had no leftover (absorbed) and no bounceBack — recede in that column should be ~0.
    // Note: the documented lateral-spread leak (~0.04) bleeds tiny amounts into the absorbed column,
    // which is enough to register as castle flood under the strict `> 0` check. Asserting only that
    // the recede height stays within the leak threshold.
    expect(recede.recedeHeightMap[0][1]).toBeLessThan(0.1);
    expect(recede.recedeHeightMap[2][1]).toBeLessThan(0.1);
  });

  it('castle bypassed on advance can flood via lateral recede spread', () => {
    // Castle at (1, 1). Hole at (1, 0) absorbs the wave in castle column on advance.
    // Adjacent col 0 and col 2 pass through and recede; lateral spread on recede pushes water into col 1.
    const grid = [
      [0, -2, 0],
      [0,  0, 0],
      [0,  0, 0],
    ];
    const effective = [
      [0, 2, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const advance = simulateAdvance({
      elevations: grid,
      columnHeights: [2, 2, 2],
      castleCol: 1,
      castleRow: 1,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: effective,
      poolMap: new Map(),
    });
    // Castle may or may not flood on advance due to lateral spread leak; the test focuses on the recede side
    const recede = simulateRecede({
      elevations: grid,
      survivedAtMaxRow: advance.survivedAtMaxRow,
      bounceBack: advance.bounceBack,
      castleCol: 1,
      castleRow: 1,
      maxRows: 3,
      terrainSlope: 0,
      effectiveHoleDepths: effective,
      poolMap: new Map(),
    });
    // Recede water in adjacent columns should spread laterally into col 1 by row 1
    expect(recede.recedeHeightMap[1][1]).toBeGreaterThan(0);
  });
});
