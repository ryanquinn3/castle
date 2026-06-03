import { describe, expect, test, vi } from 'vitest';
import { TideWaveCountdown } from './tide-wave-countdown.ts';

describe('TideWaveCountdown', () => {
  test('pauses and resumes with remaining time', () => {
    vi.useFakeTimers();
    try {
      const updates: number[] = [];
      const fired = vi.fn<() => void>();
      const countdown = new TideWaveCountdown(5000, (seconds) => updates.push(seconds), fired);

      countdown.start();
      vi.advanceTimersByTime(2200);
      countdown.pause();

      vi.advanceTimersByTime(5000);
      expect(fired).not.toHaveBeenCalled();

      countdown.resume();
      vi.advanceTimersByTime(2799);
      expect(fired).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fired).toHaveBeenCalledTimes(1);
      expect(updates).toEqual([5, 4, 3, 2, 1, 0]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('resumes by completing when paused after expiry', () => {
    vi.useFakeTimers();
    try {
      const updates: number[] = [];
      const fired = vi.fn<() => void>();
      const countdown = new TideWaveCountdown(5000, (seconds) => updates.push(seconds), fired);

      countdown.start();
      vi.setSystemTime(Date.now() + 5000);
      countdown.pause();

      countdown.resume();

      expect(fired).toHaveBeenCalledTimes(1);
      expect(updates).toEqual([5, 0]);
    } finally {
      vi.useRealTimers();
    }
  });
});
