import type { GameMode, GameState, WaveParams, WaveOutcome, PhaseTransition } from './game-mode';
import {
  WAVE_HEIGHT_START, WAVE_HEIGHT_INCREMENT,
  WAVES_BASE, WAVES_INCREMENT,
  SCOOP_START, SCOOP_INCREMENT,
  MAX_ELEVATION, MIN_ELEVATION,
  ENHANCED_SHOVEL_WAVES_REQUIRED,
} from '../config';

export class LevelMode implements GameMode {
  nextWaveParams(state: GameState): WaveParams {
    const heightBumps = Math.floor(state.level / 2);
    const waveBumps = Math.floor((state.level - 1) / 2);
    return {
      peakHeight: WAVE_HEIGHT_START + heightBumps * WAVE_HEIGHT_INCREMENT,
      waveCount: WAVES_BASE + waveBumps * WAVES_INCREMENT,
    };
  }

  scoopBudget(state: GameState): number {
    return SCOOP_START + (state.level - 1) * SCOOP_INCREMENT;
  }

  elevationBounds(level: number): { min: number; max: number } {
    if (level >= 20) {
      return { min: -20, max: 20 };
    }
    if (level >= 10) {
      return { min: -15, max: 15 };
    }
    return { min: MIN_ELEVATION, max: MAX_ELEVATION };
  }

  resolveWave(_state: GameState, outcome: WaveOutcome): PhaseTransition {
    if (outcome.castleFlooded) {
      return { type: 'gameover' };
    }
    if (outcome.allWavesComplete) {
      return { type: 'advance' };
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
