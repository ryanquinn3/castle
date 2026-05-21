import type { GameMode, GameState, WaveParams, WaveOutcome, PhaseTransition } from './game-mode';
import {
  TIDE_BASE_HEIGHT, TIDE_GROWTH_FACTOR, TIDE_EXPONENT,
  MAX_ELEVATION, MIN_ELEVATION,
  ENHANCED_SHOVEL_WAVES_REQUIRED,
} from '../config';

export class TideMode implements GameMode {
  nextWaveParams(state: GameState): WaveParams {
    const waveNumber = state.wavesCompleted + 1;
    return {
      peakHeight: TIDE_BASE_HEIGHT + TIDE_GROWTH_FACTOR * Math.pow(waveNumber, TIDE_EXPONENT),
      waveCount: 1,
    };
  }

  scoopBudget(_state: GameState): number {
    return Infinity;
  }

  elevationBounds(_level: number): { min: number; max: number } {
    return { min: MIN_ELEVATION, max: MAX_ELEVATION };
  }

  resolveWave(_state: GameState, outcome: WaveOutcome): PhaseTransition {
    if (outcome.castleFlooded) {
      return { type: 'gameover' };
    }
    return { type: 'plan' };
  }

  checkCleanWaveReward(state: GameState, isClean: boolean): boolean {
    if (state.hasEnhancedShovel) {
      return false;
    }
    if (!isClean) {
      return false;
    }
    return state.consecutiveCleanWaves + 1 >= ENHANCED_SHOVEL_WAVES_REQUIRED;
  }
}
