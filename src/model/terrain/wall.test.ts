import { describe, expect, test } from 'vitest';
import { Wall } from './wall.ts';
import { Tower } from './tower.ts';
import { FlatGround } from './flat-ground.ts';
import { Hole } from './hole.ts';
import { GridModel } from '../grid-model.ts';
import { WaterColumn } from '../water-column.ts';
import { Resources } from '../../resources.ts';

describe('connectsTo', () => {
  test('walls connect to walls and towers, not flat/hole/null', () => {
    const wall = new Wall(3);
    expect(wall.connectsTo(new Wall(1))).toBe(true);
    expect(wall.connectsTo(new Tower(15))).toBe(true);
    expect(wall.connectsTo(new FlatGround())).toBe(false);
    expect(wall.connectsTo(new Hole(2))).toBe(false);
    expect(wall.connectsTo(null)).toBe(false);
  });

  // Tower.connectsTo is tested in tower.test.ts (Tower is still a stub here)

  test('flat and hole connect to nothing', () => {
    expect(new FlatGround().connectsTo(new Wall(1))).toBe(false);
    expect(new Hole(2).connectsTo(new Hole(2))).toBe(false);
  });
});

describe('Wall', () => {
  test('elevation equals height', () => {
    const w = new Wall(5);
    expect(w.elevation).toBe(5);
  });

  test('sprite returns the tier-1 texture for height 1-5', () => {
    expect(new Wall(3).sprite).toBe(Resources.WallLevel1);
  });

  test('sprite returns the tier-4 texture for height 16-20', () => {
    expect(new Wall(18).sprite).toBe(Resources.WallLevel4);
  });

  test('onWaterHit blocks when wall height >= water surface', () => {
    const w = new Wall(5);
    const col = new WaterColumn(0, 4);
    const event = w.onWaterHit(col, 'north');
    expect(event).toBe('blocked');
    expect(col.depth).toBe(0);
  });

  test('onWaterHit overtops when wall between floor and surface', () => {
    const w = new Wall(3);
    const col = new WaterColumn(0, 5);
    const event = w.onWaterHit(col, 'north');
    expect(event).toBe('overtopped');
    expect(col.floorLevel).toBe(3);
    expect(col.depth).toBe(2);
  });

  test('onWaterHit passes through when wall at or below floor', () => {
    const w = new Wall(1);
    const col = new WaterColumn(2, 5);
    const event = w.onWaterHit(col, 'north');
    expect(event).toBeNull();
  });

  test('onWaterHit counts hit when water depth >= 2 above wall', () => {
    const w = new Wall(3);
    const col = new WaterColumn(0, 6);
    w.onWaterHit(col, 'north');
    expect(w.hitCount).toBe(1);
  });

  test('onWaterHit does not count hit when water depth < 2 above wall', () => {
    const w = new Wall(3);
    const col = new WaterColumn(0, 4);
    w.onWaterHit(col, 'north');
    expect(w.hitCount).toBe(0);
  });

  test('erodes after 3 hits', () => {
    const w = new Wall(5);
    const tallColumn = () => new WaterColumn(0, 10);
    w.onWaterHit(tallColumn(), 'north');
    w.onWaterHit(tallColumn(), 'north');
    w.onWaterHit(tallColumn(), 'north');
    expect(w.elevation).toBe(4);
    expect(w.hitCount).toBe(0);
  });

  test('applyHits erodes and returns result at threshold', () => {
    const w = new Wall(5);
    expect(w.applyHits(2)).toBeNull();
    const result = w.applyHits(1);
    expect(result).toEqual({ newElevation: 4 });
    expect(w.hitCount).toBe(0);
  });

  test('applyHits handles multiple erosions from large hit count', () => {
    const w = new Wall(5);
    w.applyHits(6);
    expect(w.elevation).toBe(3);
    expect(w.hitCount).toBe(0);
  });

  test('applyDelta +2 increases height', () => {
    const w = new Wall(3);
    const result = w.applyDelta(2);
    expect(result.elevation).toBe(5);
    expect(result).toBe(w);
  });

  test('applyDelta -3 on height 3 returns FlatGround', () => {
    const w = new Wall(3);
    const result = w.applyDelta(-3);
    expect(result.constructor.name).toBe('FlatGround');
  });

  test('applyDelta -5 on height 3 returns Hole with depth 2', () => {
    const w = new Wall(3);
    const result = w.applyDelta(-5);
    expect(result.constructor.name).toBe('Hole');
    expect(result.elevation).toBe(-2);
  });

  test('applyDelta clamps to MAX_ELEVATION', () => {
    const w = new Wall(18);
    const result = w.applyDelta(5);
    expect(result.elevation).toBe(20);
  });

  test('resetHits clears hit count', () => {
    const w = new Wall(5);
    w.applyHits(2);
    expect(w.hitCount).toBe(2);
    w.resetHits();
    expect(w.hitCount).toBe(0);
  });

  test('serialize returns wall type with height', () => {
    const w = new Wall(7);
    expect(w.serialize()).toEqual({ type: 'wall', height: 7 });
  });

  test('getRenderInfo returns customDraw with no sprite or tint', () => {
    const w = new Wall(3);
    const info = w.getRenderInfo();
    expect(info.sprite).toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeTypeOf('function');
  });
});

describe('Wall.getRenderInfo (contiguous mass)', () => {
  test('returns a customDraw and a wall cacheKey', () => {
    const info = new Wall(3).getRenderInfo();
    expect(info.customDraw).toBeTypeOf('function');
    expect(info.cacheKey).toContain('wall:');
  });

  test('cacheKey changes when a connecting neighbor appears', () => {
    const grid = new GridModel({ width: 16, height: 16, castleCol: 8, castleRow: 12, castleWidth: 2, castleHeight: 2 });
    grid.setElevation(5, 5, 3); // wall
    const before = (grid.getCell(5, 5) as unknown as Wall).getRenderInfo().cacheKey;
    grid.setElevation(6, 5, 3); // connecting wall to the east
    const after = (grid.getCell(5, 5) as unknown as Wall).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });

  test('cacheKey changes across tiers', () => {
    const a = new Wall(3).getRenderInfo().cacheKey; // tier 0
    const b = new Wall(18).getRenderInfo().cacheKey; // tier 3
    expect(a).not.toEqual(b);
  });
});
