import { describe, it, expect } from 'vitest';
import { waveHeightForLevel, wavesForLevel } from './wave';
import { WAVE_HEIGHT_START, WAVE_HEIGHT_INCREMENT, WAVES_BASE, WAVES_INCREMENT } from './config';

describe('waveHeightForLevel', () => {
  it('returns WAVE_HEIGHT_START on level 1', () => {
    expect(waveHeightForLevel(1)).toBe(WAVE_HEIGHT_START);
  });

  it('adds WAVE_HEIGHT_INCREMENT per level above 1', () => {
    expect(waveHeightForLevel(3)).toBe(WAVE_HEIGHT_START + 2 * WAVE_HEIGHT_INCREMENT);
  });
});

describe('wavesForLevel', () => {
  it('returns WAVES_BASE on level 1', () => {
    expect(wavesForLevel(1)).toBe(WAVES_BASE);
  });

  it('adds WAVES_INCREMENT per level above 1', () => {
    expect(wavesForLevel(4)).toBe(WAVES_BASE + 3 * WAVES_INCREMENT);
  });
});
