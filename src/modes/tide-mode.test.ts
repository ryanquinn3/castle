import { describe, expect, test as baseTest } from 'vitest';
import { TideMode } from './tide-mode.ts';
import type { GameState } from './game-mode.ts';
import { TIDE_BASE_HEIGHT, TIDE_GROWTH_FACTOR, TIDE_EXPONENT } from '../config.ts';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    level: 1,
    wavesCompleted: 0,
    consecutiveCleanWaves: 0,
    hasEnhancedShovel: false,
    ...overrides,
  };
}

const test = baseTest.extend<{ mode: TideMode }>({
  // eslint-disable-next-line no-empty-pattern
  mode: async ({}, use) => {
    await use(new TideMode());
  },
});

describe('TideMode.nextWaveParams', () => {
  test('wave 1 returns base height with count 1', ({ mode }) => {
    const params = mode.nextWaveParams(makeState({ wavesCompleted: 0 }));
    expect(params.peakHeight).toBeCloseTo(TIDE_BASE_HEIGHT + TIDE_GROWTH_FACTOR * Math.pow(1, TIDE_EXPONENT));
    expect(params.waveCount).toBe(1);
  });

  test('wave height grows exponentially', ({ mode }) => {
    const wave5 = mode.nextWaveParams(makeState({ wavesCompleted: 4 }));
    const wave10 = mode.nextWaveParams(makeState({ wavesCompleted: 9 }));
    const wave20 = mode.nextWaveParams(makeState({ wavesCompleted: 19 }));
    expect(wave10.peakHeight).toBeGreaterThan(wave5.peakHeight);
    expect(wave20.peakHeight).toBeGreaterThan(wave10.peakHeight);
    const gap1 = wave10.peakHeight - wave5.peakHeight;
    const gap2 = wave20.peakHeight - wave10.peakHeight;
    expect(gap2).toBeGreaterThan(gap1);
  });
});

describe('TideMode.scoopBudget', () => {
  test('returns Infinity (unlimited scoops)', ({ mode }) => {
    expect(mode.scoopBudget(makeState())).toBe(Infinity);
  });
});

describe('TideMode.elevationBounds', () => {
  test('returns fixed bounds', ({ mode }) => {
    const bounds = mode.elevationBounds(1);
    expect(bounds.min).toBeLessThan(0);
    expect(bounds.max).toBeGreaterThan(0);
  });
});

describe('TideMode.resolveWave', () => {
  test('returns gameover when castle flooded', ({ mode }) => {
    const result = mode.resolveWave(makeState(), { castleFlooded: true, allWavesComplete: true });
    expect(result).toEqual({ type: 'gameover' });
  });

  test('returns plan when castle survives (never advances)', ({ mode }) => {
    const result = mode.resolveWave(makeState(), { castleFlooded: false, allWavesComplete: true });
    expect(result).toEqual({ type: 'plan' });
  });
});

describe('TideMode.checkCleanWaveReward', () => {
  test('still awards enhanced shovel at threshold', ({ mode }) => {
    const state = makeState({ consecutiveCleanWaves: 4 });
    expect(mode.checkCleanWaveReward(state, true)).toBe(true);
  });
});
