import { describe, expect, it } from 'vitest';
import { generateWaveSegmentSpawns } from './wave-spawner.ts';

describe('generateWaveSegmentSpawns', () => {
  it('creates one spawn per column', () => {
    const spawns = generateWaveSegmentSpawns({
      numCols: 4,
      tileSize: 16,
      gridLeft: 100,
      gridTop: 200,
      peakHeight: 4,
      valleyFraction: 0.5,
      peakPhase: 0,
      numPeaks: 1,
      waveIndex: 1,
    });

    expect(spawns).toHaveLength(4);
    expect(spawns.map(s => s.col)).toEqual([0, 1, 2, 3]);
    expect(spawns[0].x).toBe(108);
    expect(spawns[1].x).toBe(124);
  });

  it('keeps existing peak and valley depth shape', () => {
    const spawns = generateWaveSegmentSpawns({
      numCols: 3,
      tileSize: 16,
      gridLeft: 0,
      gridTop: 0,
      peakHeight: 4,
      valleyFraction: 0.5,
      peakPhase: 0,
      numPeaks: 1,
      waveIndex: 1,
    });

    expect(spawns.map(s => Math.round(s.initialDepth * 100) / 100)).toEqual([2, 4, 2]);
  });

  it('uses deterministic staggered y offsets', () => {
    const first = generateWaveSegmentSpawns({
      numCols: 4,
      tileSize: 16,
      gridLeft: 0,
      gridTop: 100,
      peakHeight: 4,
      valleyFraction: 0.5,
      peakPhase: 0,
      numPeaks: 1,
      waveIndex: 7,
    });
    const second = generateWaveSegmentSpawns({
      numCols: 4,
      tileSize: 16,
      gridLeft: 0,
      gridTop: 100,
      peakHeight: 4,
      valleyFraction: 0.5,
      peakPhase: 0,
      numPeaks: 1,
      waveIndex: 7,
    });

    expect(second.map(s => s.y)).toEqual(first.map(s => s.y));
    expect(new Set(first.map(s => s.y)).size).toBeGreaterThan(1);
    for (const spawn of first) {
      expect(spawn.y).toBeLessThan(100);
    }
  });
});
