import { describe, expect, test as baseTest } from 'vitest';
import { LevelMode } from './level-mode.ts';
import type { GameState } from './game-mode.ts';
import {
  WAVE_HEIGHT_START, WAVE_HEIGHT_INCREMENT,
  WAVES_BASE, WAVES_INCREMENT,
  SCOOP_START, SCOOP_INCREMENT,
  MAX_ELEVATION, MIN_ELEVATION,
  ENHANCED_SHOVEL_WAVES_REQUIRED,
} from '../config.ts';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    level: 1,
    wavesCompleted: 0,
    consecutiveCleanWaves: 0,
    hasEnhancedShovel: false,
    ...overrides,
  };
}

const test = baseTest.extend<{ mode: LevelMode }>({
  // eslint-disable-next-line no-empty-pattern
  mode: async ({}, use) => {
    await use(new LevelMode());
  },
});

describe('LevelMode.nextWaveParams', () => {
  test('level 1 returns base wave height and count', ({ mode }) => {
    const params = mode.nextWaveParams(makeState({ level: 1 }));
    expect(params.peakHeight).toBe(WAVE_HEIGHT_START);
    expect(params.waveCount).toBe(WAVES_BASE);
  });

  test('height increases every other level', ({ mode }) => {
    const params = mode.nextWaveParams(makeState({ level: 3 }));
    expect(params.peakHeight).toBe(WAVE_HEIGHT_START + Math.floor(3 / 2) * WAVE_HEIGHT_INCREMENT);
  });

  test('wave count increases every other level starting from level 2', ({ mode }) => {
    const params = mode.nextWaveParams(makeState({ level: 4 }));
    expect(params.waveCount).toBe(WAVES_BASE + Math.floor(3 / 2) * WAVES_INCREMENT);
  });

  test('level 6 has correct values', ({ mode }) => {
    const params = mode.nextWaveParams(makeState({ level: 6 }));
    expect(params.peakHeight).toBe(WAVE_HEIGHT_START + 3 * WAVE_HEIGHT_INCREMENT);
    expect(params.waveCount).toBe(WAVES_BASE + 2 * WAVES_INCREMENT);
  });
});

describe('LevelMode.scoopBudget', () => {
  test('level 1 returns SCOOP_START', ({ mode }) => {
    expect(mode.scoopBudget(makeState({ level: 1 }))).toBe(SCOOP_START);
  });

  test('scales linearly with level', ({ mode }) => {
    expect(mode.scoopBudget(makeState({ level: 5 }))).toBe(SCOOP_START + 4 * SCOOP_INCREMENT);
  });
});

describe('LevelMode.elevationBounds', () => {
  test('early levels return default bounds', ({ mode }) => {
    expect(mode.elevationBounds(1)).toEqual({ min: MIN_ELEVATION, max: MAX_ELEVATION });
    expect(mode.elevationBounds(9)).toEqual({ min: MIN_ELEVATION, max: MAX_ELEVATION });
  });

  test('level 10+ expands to 15', ({ mode }) => {
    expect(mode.elevationBounds(10)).toEqual({ min: -15, max: 15 });
    expect(mode.elevationBounds(19)).toEqual({ min: -15, max: 15 });
  });

  test('level 20+ expands to 20', ({ mode }) => {
    expect(mode.elevationBounds(20)).toEqual({ min: -20, max: 20 });
    expect(mode.elevationBounds(25)).toEqual({ min: -20, max: 20 });
  });
});

describe('LevelMode.resolveWave', () => {
  test('returns gameover when castle is flooded', ({ mode }) => {
    const result = mode.resolveWave(makeState(), { castleFlooded: true, allWavesComplete: false });
    expect(result).toEqual({ type: 'gameover' });
  });

  test('returns advance when all waves complete', ({ mode }) => {
    const result = mode.resolveWave(makeState(), { castleFlooded: false, allWavesComplete: true });
    expect(result).toEqual({ type: 'advance' });
  });

  test('returns plan otherwise', ({ mode }) => {
    const result = mode.resolveWave(makeState(), { castleFlooded: false, allWavesComplete: false });
    expect(result).toEqual({ type: 'plan' });
  });

  test('gameover takes priority over allWavesComplete', ({ mode }) => {
    const result = mode.resolveWave(makeState(), { castleFlooded: true, allWavesComplete: true });
    expect(result).toEqual({ type: 'gameover' });
  });
});

describe('LevelMode.checkCleanWaveReward', () => {
  test('returns true when reaching threshold', ({ mode }) => {
    const state = makeState({ consecutiveCleanWaves: ENHANCED_SHOVEL_WAVES_REQUIRED - 1 });
    expect(mode.checkCleanWaveReward(state, true)).toBe(true);
  });

  test('returns false when not yet at threshold', ({ mode }) => {
    const state = makeState({ consecutiveCleanWaves: ENHANCED_SHOVEL_WAVES_REQUIRED - 2 });
    expect(mode.checkCleanWaveReward(state, true)).toBe(false);
  });

  test('returns false if already has enhanced shovel', ({ mode }) => {
    const state = makeState({
      consecutiveCleanWaves: ENHANCED_SHOVEL_WAVES_REQUIRED - 1,
      hasEnhancedShovel: true,
    });
    expect(mode.checkCleanWaveReward(state, true)).toBe(false);
  });

  test('returns false on dirty wave', ({ mode }) => {
    const state = makeState({ consecutiveCleanWaves: ENHANCED_SHOVEL_WAVES_REQUIRED - 1 });
    expect(mode.checkCleanWaveReward(state, false)).toBe(false);
  });
});
