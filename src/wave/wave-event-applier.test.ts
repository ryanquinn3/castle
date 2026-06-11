import { describe, expect, it, vi } from 'vitest';
import { CASTLE_HEIGHT, CASTLE_WIDTH } from '../config.ts';
import { GridModel } from '../model/grid-model.ts';
import type { SandLayer } from '../view/sand-layer.ts';
import { WaveEventApplier } from './wave-event-applier.ts';

function makeSandLayerDouble(): { sandLayer: SandLayer; calls: Array<[number, number]> } {
  const calls: Array<[number, number]> = [];
  const sandLayer = {
    coverCell: (col: number, gameRow: number) => {
      calls.push([col, gameRow]);
    },
  } as unknown as SandLayer;
  return { sandLayer, calls };
}

function makeGridModel(): GridModel {
  const scene = { add: () => {}, remove: () => {} } as never;
  return new GridModel(
    {
      width: 4,
      height: 4,
      castleCol: 2,
      castleRow: 2,
      castleWidth: CASTLE_WIDTH,
      castleHeight: CASTLE_HEIGHT,
    },
    scene,
  );
}

describe('WaveEventApplier', () => {
  it('applies absorbed events as puddles', () => {
    const grid = makeGridModel();
    grid.setElevation(1, 1, -3);
    const applier = new WaveEventApplier(grid);

    applier.apply({ type: 'absorbed', col: 1, row: 1, absorbedDepth: 2 });

    expect(grid.getPuddleDepth(1, 1)).toBe(2);
  });

  it('does not count absorbed events toward erosion', () => {
    const grid = makeGridModel();
    grid.setElevation(1, 1, -3);
    grid.incrementHitCount(1, 1, 2);
    const applyWaveWaterHit = vi.spyOn(grid, 'applyWaveWaterHit');
    const applier = new WaveEventApplier(grid);

    const result = applier.apply({ type: 'absorbed', col: 1, row: 1, absorbedDepth: 1 });

    expect(applyWaveWaterHit).not.toHaveBeenCalled();
    expect(result.erodedTile).toBeNull();
    expect(grid.getElevation(1, 1)).toBe(-3);
  });

  it('counts every water hit toward wall HP until destroyed', () => {
    const grid = makeGridModel();
    grid.placeWall(1, 1, 1); // L1 wall: elevation 5, hp 15
    const applier = new WaveEventApplier(grid);

    // Apply 14 hits (depth 7 overtops wall at 5 by 2, so each applyWaveWaterHit hit counts)
    for (let i = 0; i < 14; i++) {
      applier.apply({ type: 'tileEntered', col: 1, row: 1, depth: 7 });
    }
    // 15th hit destroys the wall
    const result = applier.apply({ type: 'tileEntered', col: 1, row: 1, depth: 7 });

    expect(result.erodedTile).not.toBeNull();
    expect(grid.getElevation(1, 1)).toBe(0);
  });

  it('does not redistribute sand on walls for blocked and overtopped events', () => {
    const grid = makeGridModel();
    grid.placeWall(1, 1, 1); // L1 wall: elevation 5
    const applier = new WaveEventApplier(grid);

    const blockedResult = applier.apply({ type: 'blocked', col: 1, row: 1 });
    const overtoppedResult = applier.apply({ type: 'overtopped', col: 1, row: 1 });

    // Walls are immutable to redistribution — no sand moves, no delay triggered
    expect(blockedResult.sandRedistributed).toBe(false);
    expect(overtoppedResult.sandRedistributed).toBe(false);
    expect(grid.getElevation(1, 1)).toBe(5);
  });

  it('does not count blocked or overtopped events toward erosion', () => {
    const grid = makeGridModel();
    grid.placeWall(1, 1, 1); // L1 wall: elevation 5
    const applyWaveWaterHit = vi.spyOn(grid, 'applyWaveWaterHit');
    const applier = new WaveEventApplier(grid);

    const blockedResult = applier.apply({ type: 'blocked', col: 1, row: 1 });
    const overtoppedResult = applier.apply({ type: 'overtopped', col: 1, row: 1 });

    expect(applyWaveWaterHit).not.toHaveBeenCalled();
    expect(blockedResult.erodedTile).toBeNull();
    expect(overtoppedResult.erodedTile).toBeNull();
    // Wall is immutable to blocked/overtopped redistribution
    expect(grid.getElevation(1, 1)).toBe(5);
  });

  it('forwards tileCovered events to the sand layer', () => {
    const grid = makeGridModel();
    const { sandLayer, calls } = makeSandLayerDouble();
    const applier = new WaveEventApplier(grid, sandLayer);

    applier.apply({ type: 'tileCovered', col: 2, row: 3 });

    expect(calls).toEqual([[2, 3]]);
  });

  it('ignores tileCovered events when no sand layer is provided', () => {
    const grid = makeGridModel();
    const applier = new WaveEventApplier(grid);

    expect(() => applier.apply({ type: 'tileCovered', col: 0, row: 0 })).not.toThrow();
  });

  it('reports castle flooding', () => {
    const grid = makeGridModel();
    const applier = new WaveEventApplier(grid);

    const result = applier.apply({ type: 'castleFlooded', col: 2, row: 2 });

    expect(result.castleFlooded).toBe(true);
  });
});
