import type { GridView } from '../view/grid-view.ts';
import type { WaveEventApplyResult, WaveSegmentEvent } from './wave-segment-types.ts';

export class WaveEventApplier {
  constructor(private readonly grid: GridView) {}

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
      this.grid.applyActorPuddleDelta(event.col, event.row, event.absorbedDepth);
      return result;
    }

    if (event.type === 'blocked' || event.type === 'overtopped') {
      result.sandRedistributed = this.grid.applyActorSandRedistribution(event.col, event.row);
      return result;
    }

    result.erodedTile = this.grid.applyWaveWaterHit(event.col, event.row, event.depth);
    return result;
  }
}
