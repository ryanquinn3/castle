import { describe, expect, test } from 'vitest';
import { Wall } from './wall.ts';
import { Tower } from './tower.ts';
import { FlatGround } from './flat-ground.ts';
import { Hole } from './hole.ts';
import { GridModel } from '../grid-model.ts';
import { Resources } from '../../resources.ts';
import { WALL_LEVEL_HP, WALL_LEVEL_COST } from '../../config.ts';

describe('connectsTo', () => {
  test('walls connect to walls and towers, not flat/hole/null', () => {
    const wall = new Wall(3);
    expect(wall.connectsTo(new Wall(1))).toBe(true);
    expect(wall.connectsTo(new Tower(15))).toBe(true);
    expect(wall.connectsTo(new FlatGround())).toBe(false);
    expect(wall.connectsTo(new Hole(2))).toBe(false);
    expect(wall.connectsTo(null)).toBe(false);
  });
});

describe('Wall levels', () => {
  test('elevation derives from level', () => {
    expect(new Wall(1).elevation).toBe(5);
    expect(new Wall(2).elevation).toBe(10);
    expect(new Wall(3).elevation).toBe(15);
    expect(new Wall(4).elevation).toBe(20);
  });

  test('constructor clamps level to 1..4', () => {
    expect(new Wall(0).level).toBe(1);
    expect(new Wall(9).level).toBe(4);
  });

  test('hp initializes to the level cumulative max', () => {
    expect(new Wall(1).hp).toBe(WALL_LEVEL_HP[0]);
    expect(new Wall(4).hp).toBe(WALL_LEVEL_HP[3]);
  });

  test('sprite maps level to its swatch texture', () => {
    expect(new Wall(1).sprite).toBe(Resources.WallSwatch1);
    expect(new Wall(4).sprite).toBe(Resources.WallSwatch4);
  });
});

describe('Wall config constants', () => {
  test('WALL_LEVEL_COST has 4 entries matching expected costs', () => {
    expect(WALL_LEVEL_COST).toEqual([1, 5, 10, 20]);
  });
});

describe('Wall damage (all-or-nothing)', () => {
  test('applyHits decrements hp without changing elevation until destroyed', () => {
    const w = new Wall(2); // hp 45, elevation 10
    expect(w.applyHits(10)).toBeNull();
    expect(w.hp).toBe(35);
    expect(w.elevation).toBe(10);
  });

  test('applyHits returns destruction (newElevation 0) when hp reaches 0', () => {
    const w = new Wall(1); // hp 15
    expect(w.applyHits(14)).toBeNull();
    const result = w.applyHits(1);
    expect(result).toEqual({ newElevation: 0 });
    expect(w.elevation).toBe(0);
  });

});

describe('Wall immutability to tools', () => {
  test('applyDelta is a no-op returning self', () => {
    const w = new Wall(2);
    expect(w.applyDelta(5)).toBe(w);
    expect(w.applyDelta(-5)).toBe(w);
    expect(w.elevation).toBe(10);
  });

  test('resetHits does not restore hp (damage persists)', () => {
    const w = new Wall(3);
    w.applyHits(20);
    const hpAfter = w.hp;
    w.resetHits();
    expect(w.hp).toBe(hpAfter);
  });

  test('serialize includes type, height (elevation), level, hp', () => {
    const w = new Wall(2);
    expect(w.serialize()).toEqual({ type: 'wall', height: 10, level: 2, hp: 45 });
  });
});

describe('Wall.getRenderInfo (contiguous mass)', () => {
  test('returns a customDraw and a wall cacheKey', () => {
    const info = new Wall(1).getRenderInfo();
    expect(info.customDraw).toBeTypeOf('function');
    expect(info.cacheKey).toContain('wall:');
  });

  test('cacheKey changes when a connecting neighbor appears', () => {
    const scene = { add: () => {}, remove: () => {} } as never;
    const grid = new GridModel({ width: 16, height: 16, castleCol: 8, castleRow: 12, castleWidth: 2, castleHeight: 2 }, scene);
    grid.placeWall(5, 5, 1);
    const before = (grid.getCell(5, 5) as unknown as Wall).getRenderInfo().cacheKey;
    grid.placeWall(6, 5, 1);
    const after = (grid.getCell(5, 5) as unknown as Wall).getRenderInfo().cacheKey;
    expect(before).not.toEqual(after);
  });

  test('cacheKey changes across levels', () => {
    const a = new Wall(1).getRenderInfo().cacheKey;
    const b = new Wall(4).getRenderInfo().cacheKey;
    expect(a).not.toEqual(b);
  });
});

