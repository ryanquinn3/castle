import { describe, expect, test } from 'vitest';
import { Tower } from './tower.ts';
import { Wall } from './wall.ts';
import { FlatGround } from './flat-ground.ts';
import { WaterColumn } from '../water-column.ts';

describe('Tower', () => {
  test('elevation equals height', () => {
    const t = new Tower(15);
    expect(t.elevation).toBe(15);
  });

  test('clamps height to MAX_ELEVATION', () => {
    const t = new Tower(25);
    expect(t.elevation).toBe(20);
  });

  test('onWaterHit blocks when tower height >= water surface', () => {
    const t = new Tower(15);
    const col = new WaterColumn(0, 10);
    const event = t.onWaterHit(col, 'north');
    expect(event).toBe('blocked');
    expect(col.depth).toBe(0);
  });

  test('onWaterHit overtops when tower between floor and surface', () => {
    const t = new Tower(5);
    const col = new WaterColumn(0, 10);
    const event = t.onWaterHit(col, 'north');
    expect(event).toBe('overtopped');
    expect(col.floorLevel).toBe(5);
  });

  test('onWaterHit accumulates hits when water depth >= 2 above tower', () => {
    const t = new Tower(5);
    const col = new WaterColumn(0, 10);
    t.onWaterHit(col, 'north');
    expect(t.hitCount).toBe(1);
  });

  test('erodes after TOWER_HITS_PER_EROSION hits', () => {
    const t = new Tower(15);
    for (let i = 0; i < 10; i++) {
      t.onWaterHit(new WaterColumn(0, 20), 'north');
    }
    expect(t.elevation).toBe(14);
    expect(t.hitCount).toBe(0);
  });

  test('does not erode before reaching hit threshold', () => {
    const t = new Tower(15);
    for (let i = 0; i < 9; i++) {
      t.onWaterHit(new WaterColumn(0, 20), 'north');
    }
    expect(t.elevation).toBe(15);
    expect(t.hitCount).toBe(9);
  });

  test('applyHits erodes using TOWER_HITS_PER_EROSION threshold', () => {
    const t = new Tower(15);
    const result = t.applyHits(10);
    expect(result).toEqual({ newElevation: 14 });
  });

  test('applyHits handles multiple erosions', () => {
    const t = new Tower(15);
    t.applyHits(20);
    expect(t.elevation).toBe(13);
  });

  test('applyDelta returns self unchanged (immutable to tools)', () => {
    const t = new Tower(15);
    const result = t.applyDelta(5);
    expect(result).toBe(t);
    expect(t.elevation).toBe(15);
  });

  test('applyDelta with negative returns self unchanged', () => {
    const t = new Tower(15);
    const result = t.applyDelta(-5);
    expect(result).toBe(t);
    expect(t.elevation).toBe(15);
  });

  test('serialize returns tower type with height', () => {
    const t = new Tower(15);
    expect(t.serialize()).toEqual({ type: 'tower', height: 15 });
  });

  test('resetHits clears hit count', () => {
    const t = new Tower(15);
    t.applyHits(5);
    expect(t.hitCount).toBe(5);
    t.resetHits();
    expect(t.hitCount).toBe(0);
  });

  test('becomes FlatGround when fully eroded', () => {
    const t = new Tower(1);
    t.applyHits(10);
    expect(t.elevation).toBe(0);
  });

  test('getRenderInfo returns tower sprite with no tint', () => {
    const t = new Tower(15);
    const info = t.getRenderInfo();
    expect(info.sprite).not.toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeUndefined();
  });

  test('towers connect to walls and towers', () => {
    const tower = new Tower(15);
    expect(tower.connectsTo(new Wall(1))).toBe(true);
    expect(tower.connectsTo(new Tower(15))).toBe(true);
    expect(tower.connectsTo(new FlatGround())).toBe(false);
  });
});
