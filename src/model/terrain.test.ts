import { describe, expect, test } from 'vitest';
import { FlatGround, Hole, Wall } from './terrain.ts';
import { WaterColumn } from './water-column.ts';

describe('FlatGround', () => {
  test('has elevation 0', () => {
    const t = new FlatGround();
    expect(t.elevation).toBe(0);
  });

  test('sprite is null', () => {
    const t = new FlatGround();
    expect(t.sprite).toBeNull();
  });

  test('onWaterHit passes water through unchanged', () => {
    const t = new FlatGround();
    const column = new WaterColumn(0, 5);
    const event = t.onWaterHit(column, 'north');
    expect(event).toBeNull();
    expect(column.depth).toBe(5);
  });

  test('applyHits returns null', () => {
    const t = new FlatGround();
    expect(t.applyHits(5)).toBeNull();
  });

  test('applyDelta +3 returns Wall with height 3', () => {
    const t = new FlatGround();
    const result = t.applyDelta(3);
    expect(result.elevation).toBe(3);
    expect(result.constructor.name).toBe('Wall');
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
});

describe('Wall', () => {
  test('elevation equals height', () => {
    const w = new Wall(5);
    expect(w.elevation).toBe(5);
  });

  test('sprite returns WallLevel1 for height 1-5', () => {
    const w = new Wall(3);
    expect(w.sprite).not.toBeNull();
  });

  test('sprite returns WallLevel4 for height 16-20', () => {
    const w = new Wall(18);
    expect(w.sprite).not.toBeNull();
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
});

describe('Hole', () => {
  test('elevation is negative depth', () => {
    const h = new Hole(3);
    expect(h.elevation).toBe(-3);
  });

  test('sprite is null', () => {
    const h = new Hole(3);
    expect(h.sprite).toBeNull();
  });

  test('starts with 0 puddle depth', () => {
    const h = new Hole(3);
    expect(h.puddleDepth).toBe(0);
  });

  test('effectiveDepth is depth minus puddle', () => {
    const h = new Hole(5);
    h.puddleDepth = 2;
    expect(h.effectiveDepth).toBe(3);
  });

  test('effectiveDepth is 0 when fully puddled', () => {
    const h = new Hole(3);
    h.puddleDepth = 3;
    expect(h.effectiveDepth).toBe(0);
  });

  test('addPuddle increases puddle depth clamped to max', () => {
    const h = new Hole(3);
    h.addPuddle(5);
    expect(h.puddleDepth).toBe(3);
  });

  test('onWaterHit returns null (holes handled by pool absorption)', () => {
    const h = new Hole(3);
    const col = new WaterColumn(0, 5);
    const event = h.onWaterHit(col, 'north');
    expect(event).toBeNull();
  });

  test('applyHits erodes toward zero after threshold', () => {
    const h = new Hole(3);
    const result = h.applyHits(3);
    expect(result).toEqual({ newElevation: -2 });
    expect(h.elevation).toBe(-2);
  });

  test('applyDelta +3 on depth 3 returns FlatGround', () => {
    const h = new Hole(3);
    const result = h.applyDelta(3);
    expect(result.constructor.name).toBe('FlatGround');
  });

  test('applyDelta +5 on depth 3 returns Wall with height 2', () => {
    const h = new Hole(3);
    const result = h.applyDelta(5);
    expect(result.constructor.name).toBe('Wall');
    expect(result.elevation).toBe(2);
  });

  test('applyDelta -2 increases depth', () => {
    const h = new Hole(3);
    const result = h.applyDelta(-2);
    expect(result.elevation).toBe(-5);
    expect(result).toBe(h);
  });

  test('applyDelta clamps to MIN_ELEVATION', () => {
    const h = new Hole(18);
    const result = h.applyDelta(-5);
    expect(result.elevation).toBe(-20);
  });

  test('applyDelta clears excess puddle when depth shrinks', () => {
    const h = new Hole(5);
    h.puddleDepth = 4;
    h.applyDelta(3);
    expect(h.depth).toBe(2);
    expect(h.puddleDepth).toBe(2);
  });

  test('resetHits clears hit count', () => {
    const h = new Hole(3);
    h.applyHits(2);
    h.resetHits();
    expect(h.applyHits(2)).toBeNull();
  });

  test('serialize returns hole type with negative height and puddleDepth', () => {
    const h = new Hole(3);
    h.addPuddle(1.5);
    expect(h.serialize()).toEqual({ type: 'hole', height: -3, puddleDepth: 1.5 });
  });
});
