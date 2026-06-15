import { describe, expect, test } from 'vitest';
import { FlatGround } from './flat-ground.ts';
import { Wall } from './wall.ts';
import { Tower } from './tower.ts';
import type { NeighborGrid } from './terrain.ts';

describe('Terrain.neighbors', () => {
  test('unattached terrain reports all-null neighbors', () => {
    const wall = new Wall(3);
    expect(wall.neighbors).toEqual({ north: null, south: null, east: null, west: null });
  });

  test('attach wires a NeighborGrid that resolves directions', () => {
    const north = new Wall(1);
    const fakeGrid: NeighborGrid = {
      neighborsOf: (_col: number, _row: number) => ({ north, south: null, east: null, west: null }),
    };
    const wall = new Wall(3);
    wall.attach(fakeGrid, 2, 5);
    expect(wall.col).toBe(2);
    expect(wall.row).toBe(5);
    expect(wall.neighbors.north).toBe(north);
  });
});

describe('FlatGround', () => {
  test('has elevation 0', () => {
    const t = new FlatGround();
    expect(t.elevation).toBe(0);
  });

  test('sprite is null', () => {
    const t = new FlatGround();
    expect(t.sprite).toBeNull();
  });

  test('applyHits returns null', () => {
    const t = new FlatGround();
    expect(t.applyHits(5)).toBeNull();
  });

  test('applyDelta +3 returns self (walls placed via placeWall, not delta)', () => {
    const t = new FlatGround();
    const result = t.applyDelta(3);
    expect(result).toBe(t);
    expect(result.elevation).toBe(0);
  });

  test('applyDelta -2 returns Hole with depth 2', () => {
    const t = new FlatGround();
    const result = t.applyDelta(-2);
    expect(result.elevation).toBe(-2);
    expect(result.constructor.name).toBe('Hole');
  });

  test('applyDelta 0 returns FlatGround', () => {
    const t = new FlatGround();
    const result = t.applyDelta(0);
    expect(result.constructor.name).toBe('FlatGround');
  });

  test('resetHits is a no-op', () => {
    const t = new FlatGround();
    t.resetHits();
    expect(t.elevation).toBe(0);
  });

  test('serialize returns flat type with height 0', () => {
    const t = new FlatGround();
    expect(t.serialize()).toEqual({ type: 'flat', height: 0 });
  });

  test('getRenderInfo returns null sprite and no customDraw', () => {
    const t = new FlatGround();
    const info = t.getRenderInfo();
    expect(info.sprite).toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeUndefined();
  });

  test('connectsTo returns false for any terrain', () => {
    const t = new FlatGround();
    expect(t.connectsTo(new Wall(1))).toBe(false);
    expect(t.connectsTo(new Tower(15))).toBe(false);
    expect(t.connectsTo(new FlatGround())).toBe(false);
    expect(t.connectsTo(null)).toBe(false);
  });
});
