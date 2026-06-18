import { describe, expect, test } from 'vitest';
import { Tower } from './tower.ts';
import { Wall } from './wall.ts';
import { FlatGround } from './flat-ground.ts';
import { TOWER_HP } from '../../config.ts';

describe('Tower construction', () => {
  test('elevation equals clamped height while HP > 0', () => {
    const t = new Tower(15);
    expect(t.elevation).toBe(15);
  });

  test('clamps height to MAX_ELEVATION', () => {
    const t = new Tower(25);
    expect(t.elevation).toBe(20);
  });

  test('hp starts at TOWER_HP', () => {
    const t = new Tower(15);
    expect(t.hp).toBe(TOWER_HP);
  });
});

describe('Tower damage (all-or-nothing)', () => {
  test('applyHits decrements HP without changing elevation until destroyed', () => {
    const t = new Tower(15);
    expect(t.applyHits(10)).toBeNull();
    expect(t.hp).toBe(TOWER_HP - 10);
    expect(t.elevation).toBe(15);
  });

  test('applyHits returns {newElevation:0} only when HP reaches 0', () => {
    const t = new Tower(15);
    expect(t.applyHits(TOWER_HP - 1)).toBeNull();
    const result = t.applyHits(1);
    expect(result).toEqual({ newElevation: 0 });
  });

  test('elevation becomes 0 only when HP reaches 0', () => {
    const t = new Tower(15);
    t.applyHits(TOWER_HP - 1);
    expect(t.elevation).toBe(15); // still alive
    t.applyHits(1);
    expect(t.elevation).toBe(0); // destroyed
  });

  test('no height-stepping: HP drains with no intermediate elevation changes', () => {
    const t = new Tower(15);
    const heights: number[] = [];
    for (let i = 0; i < 14; i++) {
      t.applyHits(10);
      heights.push(t.elevation);
    }
    // elevation stays at fixedHeight until destroyed
    expect(heights.every(h => h === 15)).toBe(true);
  });

  test('full HP drain destroys tower', () => {
    const t = new Tower(15);
    t.applyHits(TOWER_HP);
    expect(t.elevation).toBe(0);
    expect(t.hp).toBe(0);
  });
});

describe('Tower immutability to tools', () => {
  test('applyDelta returns self unchanged', () => {
    const t = new Tower(15);
    expect(t.applyDelta(5)).toBe(t);
    expect(t.applyDelta(-5)).toBe(t);
    expect(t.elevation).toBe(15);
  });

  test('resetHits is a no-op (HP persists)', () => {
    const t = new Tower(15);
    t.applyHits(50);
    const hpAfter = t.hp;
    t.resetHits();
    expect(t.hp).toBe(hpAfter);
  });
});

describe('Tower serialize and describe', () => {
  test('serialize includes type, height, and hp', () => {
    const t = new Tower(15);
    expect(t.serialize()).toEqual({ type: 'tower', height: 15, hp: TOWER_HP });
  });

  test('serialize hp reflects current HP after damage', () => {
    const t = new Tower(15);
    t.applyHits(30);
    expect(t.serialize()).toMatchObject({ hp: TOWER_HP - 30 });
  });

  test('describe returns Tower title with Height and HP stats', () => {
    const t = new Tower(15);
    const info = t.describe();
    expect(info.title).toBe('Tower');
    expect(info.stats).toContainEqual({ label: 'Height', value: '15' });
    expect(info.stats).toContainEqual({ label: 'HP', value: String(TOWER_HP) });
  });

  test('describe HP stat updates after damage', () => {
    const t = new Tower(15);
    t.applyHits(50);
    const info = t.describe();
    expect(info.stats).toContainEqual({ label: 'HP', value: String(TOWER_HP - 50) });
  });
});

describe('Tower connectivity', () => {
  test('towers connect to walls and towers, not flat/null', () => {
    const tower = new Tower(15);
    expect(tower.connectsTo(new Wall(1))).toBe(true);
    expect(tower.connectsTo(new Tower(15))).toBe(true);
    expect(tower.connectsTo(new FlatGround())).toBe(false);
    expect(tower.connectsTo(null)).toBe(false);
  });
});

describe('Tower getRenderInfo', () => {
  test('returns tower sprite with no tint', () => {
    const t = new Tower(15);
    const info = t.getRenderInfo();
    expect(info.sprite).not.toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeUndefined();
  });
});
