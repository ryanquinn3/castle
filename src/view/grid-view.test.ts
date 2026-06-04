import { describe, expect, test as baseTest, vi } from 'vitest';
import { Scene } from 'excalibur';
import { GridView } from './grid-view.ts';
import { GridModel } from '../model/grid-model.ts';
import { simulateWave, type WallErosionEvent } from '../model/wave-simulation.ts';
import { GRID_WIDTH, GRID_HEIGHT, CASTLE_COL, CASTLE_ROW, CASTLE_WIDTH, CASTLE_HEIGHT } from '../config.ts';

// Minimal Scene stub — GridView only calls scene.add(tile) in its constructor.
// We're stubbing a dependency (Scene), not the subject under test (GridView).
function makeScene(): Scene {
  return { add: () => {} } as unknown as Scene;
}

function makeModel(): GridModel {
  return new GridModel({ width: GRID_WIDTH, height: GRID_HEIGHT, castleCol: CASTLE_COL, castleRow: CASTLE_ROW, castleWidth: CASTLE_WIDTH, castleHeight: CASTLE_HEIGHT });
}

const test = baseTest.extend<{ grid: GridView }>({
  // eslint-disable-next-line no-empty-pattern
  grid: async ({}, use) => {
    await use(new GridView(makeModel(), makeScene()));
  },
});

describe('GridView puddle state', () => {
  test('defaults puddleDepth to 0 on all tiles', ({ grid }) => {
    expect(grid.getPuddleDepth(0, 0)).toBe(0);
    expect(grid.getPuddleDepth(5, 5)).toBe(0);
  });

  test('applyPuddleDeltas accumulates per tile, clamped to -elevation', ({ grid }) => {
    grid.setElevation(0, 0, -3);
    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 2 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(2);

    grid.applyPuddleDeltas([{ col: 0, row: 0, depth: 5 }]);
    expect(grid.getPuddleDepth(0, 0)).toBe(3);
  });

  test('applyPuddleDeltas ignores tiles with non-negative elevation', ({ grid }) => {
    grid.applyPuddleDeltas([{ col: 1, row: 1, depth: 2 }]);
    expect(grid.getPuddleDepth(1, 1)).toBe(0);
  });

  test('effectiveHoleDepth returns hole depth minus puddle', ({ grid }) => {
    grid.setElevation(2, 2, -4);
    grid.applyPuddleDeltas([{ col: 2, row: 2, depth: 1 }]);
    expect(grid.effectiveHoleDepth(2, 2)).toBe(3);
  });

  test('effectiveHoleDepth returns 0 for flat or wall tiles', ({ grid }) => {
    expect(grid.effectiveHoleDepth(0, 0)).toBe(0);
    grid.setElevation(1, 1, +2);
    expect(grid.effectiveHoleDepth(1, 1)).toBe(0);
  });
});

function gridFilledColumnHeights(grid: GridView, height: number, only: number): number[] {
  const elevs = grid.getElevations();
  const w = elevs[0]?.length ?? 0;
  return Array.from({ length: w }, (_, c) => c === only ? height : 0);
}

function deltasFromMap(map: number[][]): { col: number; row: number; depth: number }[] {
  const out: { col: number; row: number; depth: number }[] = [];
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      if (map[r][c] > 0) {
        out.push({ col: c, row: r, depth: map[r][c] });
      }
    }
  }
  return out;
}

describe('applyErosion both passes', () => {
  test('increments hit count for advance-only, recede-only, and both', ({ grid }) => {
    grid.setElevation(0, 0, 2);
    grid.setElevation(1, 0, 2);
    grid.setElevation(2, 0, 2);

    // Build full 16x16 advance and recede maps. Only the upper-left 3 cells are exercised.
    const w = grid.getElevations()[0].length;
    const h = grid.getElevations().length;
    const advance: number[][] = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));
    const recede: number[][] = Array.from({ length: h }, () => Array.from<number>({ length: w }).fill(0));

    advance[0][0] = 4;  // hit on advance only
    advance[0][2] = 4;  // hit on both
    recede[0][1] = 4;   // hit on recede only
    recede[0][2] = 4;

    grid.applyErosion(advance, recede);
    expect(grid.getTile(0, 0)!.waveHitCount).toBe(1);
    expect(grid.getTile(1, 0)!.waveHitCount).toBe(1);
    expect(grid.getTile(2, 0)!.waveHitCount).toBe(2);
  });
});

function emptyEventsMatrix(grid: GridView): WallErosionEvent[][] {
  const elevs = grid.getElevations();
  return elevs.map(row => row.map(() => null));
}

describe('applySandRedistribution', () => {
  test('drops wall by 1, sand lost when upstream is flat', ({ grid }) => {
    grid.setElevation(5, 3, +2);
    const events = emptyEventsMatrix(grid);
    events[3][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(1);
    expect(grid.getElevation(5, 2)).toBe(0);
  });

  test('also redistributes from blocked walls', ({ grid }) => {
    grid.setElevation(5, 3, +3);
    const events = emptyEventsMatrix(grid);
    events[3][5] = 'blocked';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(2);
    expect(grid.getElevation(5, 2)).toBe(0);
  });

  test('drops sand off top edge when wall is in row 0', ({ grid }) => {
    grid.setElevation(5, 0, +2);
    const events = emptyEventsMatrix(grid);
    events[0][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 0)).toBe(1);
  });

  test('drops sand into existing hole upstream (fills by 1)', ({ grid }) => {
    grid.setElevation(5, 3, +2);
    grid.setElevation(5, 2, -1);
    const events = emptyEventsMatrix(grid);
    events[3][5] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getElevation(5, 3)).toBe(1);
    expect(grid.getElevation(5, 2)).toBe(0);
  });

  test('skips castle tile', ({ grid }) => {
    const events = emptyEventsMatrix(grid);
    events[CASTLE_ROW][CASTLE_COL] = 'overtopped';
    grid.applySandRedistribution(events);
    expect(grid.getTile(CASTLE_COL, CASTLE_ROW)!.elevation).toBe(0);
  });
});

describe('actor terrain mutation refreshes', () => {
  test('applyWaveWaterHit refreshes the eroded tile and cardinal neighbors', ({ grid }) => {
    grid.setElevation(5, 5, +1);
    grid.model.incrementHitCount(5, 5, 2);

    const center = vi.spyOn(grid.getTile(5, 5)!, 'updateVisual');
    const north = vi.spyOn(grid.getTile(5, 4)!, 'updateVisual');
    const south = vi.spyOn(grid.getTile(5, 6)!, 'updateVisual');
    const west = vi.spyOn(grid.getTile(4, 5)!, 'updateVisual');
    const east = vi.spyOn(grid.getTile(6, 5)!, 'updateVisual');

    grid.applyWaveWaterHit(5, 5, 3);

    expect(center).toHaveBeenCalled();
    expect(north).toHaveBeenCalled();
    expect(south).toHaveBeenCalled();
    expect(west).toHaveBeenCalled();
    expect(east).toHaveBeenCalled();
  });

  test('applyActorSandRedistribution refreshes changed tiles and their cardinal neighbors', ({ grid }) => {
    grid.setElevation(5, 5, +2);
    grid.setElevation(5, 4, -1);

    const changedWall = vi.spyOn(grid.getTile(5, 5)!, 'updateVisual');
    const wallSouth = vi.spyOn(grid.getTile(5, 6)!, 'updateVisual');
    const wallWest = vi.spyOn(grid.getTile(4, 5)!, 'updateVisual');
    const wallEast = vi.spyOn(grid.getTile(6, 5)!, 'updateVisual');
    const changedHole = vi.spyOn(grid.getTile(5, 4)!, 'updateVisual');
    const holeNorth = vi.spyOn(grid.getTile(5, 3)!, 'updateVisual');
    const holeWest = vi.spyOn(grid.getTile(4, 4)!, 'updateVisual');
    const holeEast = vi.spyOn(grid.getTile(6, 4)!, 'updateVisual');

    grid.applyActorSandRedistribution(5, 5);

    expect(changedWall).toHaveBeenCalled();
    expect(wallSouth).toHaveBeenCalled();
    expect(wallWest).toHaveBeenCalled();
    expect(wallEast).toHaveBeenCalled();
    expect(changedHole).toHaveBeenCalled();
    expect(holeNorth).toHaveBeenCalled();
    expect(holeWest).toHaveBeenCalled();
    expect(holeEast).toHaveBeenCalled();
  });
});

describe('puddle persistence across waves', () => {
  test('second wave sees reduced hole capacity from first wave puddle', ({ grid }) => {
    grid.setElevation(1, 1, -3);

    const wave1 = simulateWave({
      cells: grid.model.getCells(),
      columnHeights: gridFilledColumnHeights(grid, 2, 1),
      castleCol: 1,
      castleRow: 2,
      castleWidth: 2,
      castleHeight: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    grid.applyPuddleDeltas(deltasFromMap(wave1.puddleDelta));
    // First wave fills some of the hole
    const puddleAfterWave1 = grid.getPuddleDepth(1, 1);
    expect(puddleAfterWave1).toBeGreaterThan(0);
    expect(puddleAfterWave1).toBeLessThanOrEqual(3);

    const wave2 = simulateWave({
      cells: grid.model.getCells(),
      columnHeights: gridFilledColumnHeights(grid, 2, 1),
      castleCol: 1,
      castleRow: 2,
      castleWidth: 2,
      castleHeight: 2,
      maxRows: 3,
      terrainSlope: 0,
      poolMap: new Map(),
    });
    // Second wave should leak at least as much past the partially-filled hole
    expect(wave2.advanceHeightMap[2][1]).toBeGreaterThanOrEqual(wave1.advanceHeightMap[2][1]);
  });
});
