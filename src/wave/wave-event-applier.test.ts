import { describe, expect, it, vi } from 'vitest';
import { CASTLE_HEIGHT, CASTLE_WIDTH } from '../config.ts';
import { GridModel } from '../model/grid-model.ts';
import type { GridView } from '../view/grid-view.ts';
import { WaveEventApplier } from './wave-event-applier.ts';

function makeGridView(): GridView {
  const model = new GridModel({
    width: 4,
    height: 4,
    castleCol: 2,
    castleRow: 2,
    castleWidth: CASTLE_WIDTH,
    castleHeight: CASTLE_HEIGHT,
  });

  const grid = {
    model,
    applyWaveWaterHit: (col: number, row: number, depth: number) => {
      const result = model.applyWaveWaterHit(col, row, depth);
      return result ? ({ col, row } as never) : null;
    },
    applyActorPuddleDelta: (col: number, row: number, depth: number) => {
      model.applyPuddleDeltas([{ col, row, depth }]);
    },
    applyActorSandRedistribution: (col: number, row: number) =>
      model.applySandRedistributionAt(col, row),
  };

  return grid as unknown as GridView;
}

describe('WaveEventApplier', () => {
  it('applies absorbed events as puddles', () => {
    const grid = makeGridView();
    grid.model.setElevation(1, 1, -3);
    const applier = new WaveEventApplier(grid);

    applier.apply({ type: 'absorbed', col: 1, row: 1, depth: 2, absorbedDepth: 2 });

    expect(grid.model.getPuddleDepth(1, 1)).toBe(2);
  });

  it('does not count absorbed events toward erosion', () => {
    const grid = makeGridView();
    grid.model.setElevation(1, 1, -3);
    grid.model.incrementHitCount(1, 1, 2);
    const applyWaveWaterHit = vi.spyOn(grid, 'applyWaveWaterHit');
    const applier = new WaveEventApplier(grid);

    const result = applier.apply({ type: 'absorbed', col: 1, row: 1, depth: 5, absorbedDepth: 1 });

    expect(applyWaveWaterHit).not.toHaveBeenCalled();
    expect(result.erodedTile).toBeNull();
    expect(grid.model.getElevation(1, 1)).toBe(-3);
  });

  it('counts every water hit toward erosion', () => {
    const grid = makeGridView();
    grid.model.setElevation(1, 1, 2);
    const applier = new WaveEventApplier(grid);

    applier.apply({ type: 'tileEntered', col: 1, row: 1, depth: 5 });
    applier.apply({ type: 'tileEntered', col: 1, row: 1, depth: 5 });
    const result = applier.apply({ type: 'tileEntered', col: 1, row: 1, depth: 5 });

    expect(result.erodedTile).not.toBeNull();
    expect(grid.model.getElevation(1, 1)).toBe(1);
  });

  it('redistributes sand for blocked and overtopped events', () => {
    const grid = makeGridView();
    grid.model.setElevation(1, 1, 3);
    const applier = new WaveEventApplier(grid);

    const blockedResult = applier.apply({ type: 'blocked', col: 1, row: 1, depth: 2 });
    const overtoppedResult = applier.apply({ type: 'overtopped', col: 1, row: 1, depth: 2 });

    expect(blockedResult.sandRedistributed).toBe(true);
    expect(overtoppedResult.sandRedistributed).toBe(true);
    expect(grid.model.getElevation(1, 1)).toBe(1);
  });

  it('does not count blocked or overtopped events toward erosion', () => {
    const grid = makeGridView();
    grid.model.setElevation(1, 1, 4);
    grid.model.incrementHitCount(1, 1, 2);
    const applyWaveWaterHit = vi.spyOn(grid, 'applyWaveWaterHit');
    const applier = new WaveEventApplier(grid);

    const blockedResult = applier.apply({ type: 'blocked', col: 1, row: 1, depth: 6 });
    grid.model.incrementHitCount(1, 1, 2);
    const overtoppedResult = applier.apply({ type: 'overtopped', col: 1, row: 1, depth: 6 });

    expect(applyWaveWaterHit).not.toHaveBeenCalled();
    expect(blockedResult.erodedTile).toBeNull();
    expect(overtoppedResult.erodedTile).toBeNull();
    expect(grid.model.getElevation(1, 1)).toBe(2);
  });

  it('reports castle flooding', () => {
    const grid = makeGridView();
    const applier = new WaveEventApplier(grid);

    const result = applier.apply({ type: 'castleFlooded', col: 2, row: 2, depth: 3 });

    expect(result.castleFlooded).toBe(true);
  });
});
