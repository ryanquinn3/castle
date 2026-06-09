import type { SandLayer } from '../view/sand-layer.ts';
import type { GridModel } from '../model/grid-model.ts';
import type { WaveEventApplyResult, WaveSegmentEvent } from './wave-segment-types.ts';

export class WaveEventApplier {
  constructor(
    private readonly grid: GridModel,
    private readonly sandLayer?: SandLayer,
  ) {}

  apply(event: WaveSegmentEvent): WaveEventApplyResult {
    const result: WaveEventApplyResult = {
      castleFlooded: false,
      erodedTile: null,
      sandRedistributed: false,
    };

    if (event.type === 'dissipated') {
      return result;
    }

    if (event.type === 'castleFlooded') {
      result.castleFlooded = true;
      return result;
    }

    if (event.type === 'absorbed') {
      this.grid.applyPuddleDelta(event.col, event.row, event.absorbedDepth);
      return result;
    }

    if (event.type === 'blocked' || event.type === 'overtopped') {
      result.sandRedistributed = this.grid.applySandRedistributionAt(event.col, event.row);
      return result;
    }

    if (event.type === 'tileCovered') {
      this.sandLayer?.coverCell(event.col, event.row);
      return result;
    }

    const erosionResult = this.grid.applyWaveWaterHit(event.col, event.row, event.depth);
    result.erodedTile = erosionResult ? this.grid.getCell(event.col, event.row) : null;
    return result;
  }
}
