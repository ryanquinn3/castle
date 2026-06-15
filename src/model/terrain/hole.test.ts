import { describe, expect, test } from 'vitest';
import { Hole } from './hole.ts';

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

  test('applyDelta +5 on depth 3 returns FlatGround (overfill yields flat, not wall)', () => {
    const h = new Hole(3);
    const result = h.applyDelta(5);
    expect(result.constructor.name).toBe('FlatGround');
    expect(result.elevation).toBe(0);
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

  test('getRenderInfo returns customDraw function', () => {
    const h = new Hole(3);
    const info = h.getRenderInfo();
    expect(info.sprite).toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeInstanceOf(Function);
  });
});
