import { describe, expect, test } from 'vitest';
import { Tower } from './tower.ts';
import { Wall } from './wall.ts';
import { FlatGround } from './flat-ground.ts';
import { TOWER_LEVEL_HEIGHT, TOWER_LEVEL_HP, TOWER_LEVEL_COST, MAX_TOWER_LEVEL } from '../../config.ts';

describe('Tower construction — per level', () => {
  for (let level = 1; level <= MAX_TOWER_LEVEL; level++) {
    test(`level ${level}: elevation equals TOWER_LEVEL_HEIGHT[${level - 1}] while HP > 0`, () => {
      const t = new Tower(level);
      expect(t.elevation).toBe(TOWER_LEVEL_HEIGHT[level - 1]);
    });

    test(`level ${level}: hp starts at TOWER_LEVEL_HP[${level - 1}]`, () => {
      const t = new Tower(level);
      expect(t.hp).toBeGreaterThan(0);
      expect(t.hp).toBe(TOWER_LEVEL_HP[level - 1]);
    });

    test(`level ${level}: repairCost equals TOWER_LEVEL_COST[${level - 1}]`, () => {
      const t = new Tower(level);
      expect(t.repairCost).toBe(TOWER_LEVEL_COST[level - 1]);
    });
  }

  test('level is clamped to 1 when below 1', () => {
    const t = new Tower(0);
    expect(t.level).toBe(1);
    expect(t.elevation).toBe(TOWER_LEVEL_HEIGHT[0]);
  });

  test('level is clamped to MAX_TOWER_LEVEL when above max', () => {
    const t = new Tower(MAX_TOWER_LEVEL + 5);
    expect(t.level).toBe(MAX_TOWER_LEVEL);
    expect(t.elevation).toBe(TOWER_LEVEL_HEIGHT[MAX_TOWER_LEVEL - 1]);
  });
});

describe('Tower damage (all-or-nothing)', () => {
  test('applyHits decrements HP without changing elevation until destroyed', () => {
    const t = new Tower(1);
    const startHp = t.hp;
    expect(t.applyHits(10)).toBeNull();
    expect(t.hp).toBe(startHp - 10);
    expect(t.elevation).toBe(TOWER_LEVEL_HEIGHT[0]);
  });

  test('applyHits returns {newElevation:0} only when HP reaches 0', () => {
    const t = new Tower(1);
    const hp = t.hp;
    expect(t.applyHits(hp - 1)).toBeNull();
    const result = t.applyHits(1);
    expect(result).toEqual({ newElevation: 0 });
  });

  test('elevation becomes 0 only when HP reaches 0', () => {
    const t = new Tower(1);
    const hp = t.hp;
    t.applyHits(hp - 1);
    expect(t.elevation).toBe(TOWER_LEVEL_HEIGHT[0]); // still alive
    t.applyHits(1);
    expect(t.elevation).toBe(0); // destroyed
  });

  test('no height-stepping: HP drains with no intermediate elevation changes', () => {
    const t = new Tower(1);
    const heights: number[] = [];
    for (let i = 0; i < 14; i++) {
      t.applyHits(10);
      heights.push(t.elevation);
    }
    // elevation stays at fixedHeight until destroyed
    expect(heights.every(h => h === TOWER_LEVEL_HEIGHT[0])).toBe(true);
  });

  test('full HP drain destroys tower', () => {
    const t = new Tower(2);
    t.applyHits(t.hp);
    expect(t.elevation).toBe(0);
    expect(t.hp).toBe(0);
  });
});

describe('Tower immutability to tools', () => {
  test('applyDelta returns self unchanged', () => {
    const t = new Tower(1);
    const origElev = t.elevation;
    expect(t.applyDelta(5)).toBe(t);
    expect(t.applyDelta(-5)).toBe(t);
    expect(t.elevation).toBe(origElev);
  });

  test('resetHits is a no-op (HP persists)', () => {
    const t = new Tower(1);
    t.applyHits(50);
    const hpAfter = t.hp;
    t.resetHits();
    expect(t.hp).toBe(hpAfter);
  });
});

describe('Tower serialize and describe', () => {
  test('serialize includes type, height, level, and hp', () => {
    const t = new Tower(1);
    const s = t.serialize();
    expect(s.type).toBe('tower');
    expect(s.height).toBe(TOWER_LEVEL_HEIGHT[0]);
    expect(s['level']).toBe(1);
    expect(s.hp).toBe(TOWER_LEVEL_HP[0]);
  });

  test('serialize level field reflects constructed level', () => {
    const t2 = new Tower(2);
    expect(t2.serialize()['level']).toBe(2);
  });

  test('serialize hp reflects current HP after damage', () => {
    const t = new Tower(1);
    t.applyHits(30);
    expect(t.serialize().hp).toBe(TOWER_LEVEL_HP[0] - 30);
  });

  test('describe returns Tower title with Level, Height, and HP stats', () => {
    const t = new Tower(2);
    const info = t.describe();
    expect(info.title).toBe('Tower');
    expect(info.stats).toContainEqual({ label: 'Level', value: '2' });
    expect(info.stats).toContainEqual({ label: 'Height', value: String(TOWER_LEVEL_HEIGHT[1]) });
    expect(info.stats).toContainEqual({ label: 'HP', value: String(TOWER_LEVEL_HP[1]) });
  });

  test('describe HP stat updates after damage', () => {
    const t = new Tower(1);
    t.applyHits(50);
    const info = t.describe();
    expect(info.stats).toContainEqual({ label: 'HP', value: String(TOWER_LEVEL_HP[0] - 50) });
  });
});

describe('Tower connectivity', () => {
  test('towers connect to walls and towers, not flat/null', () => {
    const tower = new Tower(1);
    expect(tower.connectsTo(new Wall(1))).toBe(true);
    expect(tower.connectsTo(new Tower(1))).toBe(true);
    expect(tower.connectsTo(new FlatGround())).toBe(false);
    expect(tower.connectsTo(null)).toBe(false);
  });
});

describe('Tower getRenderInfo', () => {
  test('returns tower sprite with no tint', () => {
    const t = new Tower(1);
    const info = t.getRenderInfo();
    expect(info.sprite).not.toBeNull();
    expect(info.tint).toBeNull();
    expect(info.customDraw).toBeUndefined();
  });
});
