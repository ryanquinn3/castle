export interface GameState {
  level: number;
  wavesCompleted: number;
  consecutiveCleanWaves: number;
  hasEnhancedShovel: boolean;
}

export interface WaveParams {
  peakHeight: number;
  waveCount: number;
}

export interface WaveOutcome {
  castleFlooded: boolean;
  allWavesComplete: boolean;
}

export type PhaseTransition =
  | { type: 'plan' }
  | { type: 'advance' }
  | { type: 'gameover' };

export interface GameMode {
  nextWaveParams(state: GameState): WaveParams;
  scoopBudget(state: GameState): number;
  elevationBounds(level: number): { min: number; max: number };
  resolveWave(state: GameState, outcome: WaveOutcome): PhaseTransition;
  checkCleanWaveReward(state: GameState, isClean: boolean): boolean;
}
