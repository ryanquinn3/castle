import { describe, expect, test, vi } from 'vitest';
import { LevelSessionLifecycle } from './level-session-lifecycle.ts';

describe('LevelSessionLifecycle', () => {
  test('deactivate clears timers and prevents stale async work', () => {
    vi.useFakeTimers();
    try {
      const lifecycle = new LevelSessionLifecycle();
      const cleanup = vi.fn<() => void>();
      const timerCallback = vi.fn<() => void>();

      const token = lifecycle.currentToken;
      lifecycle.addCleanup(cleanup);
      lifecycle.setTimeout(timerCallback, 1000);

      lifecycle.deactivate();
      vi.advanceTimersByTime(1000);

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(timerCallback).not.toHaveBeenCalled();
      expect(lifecycle.isCurrent(token)).toBe(false);
      expect(lifecycle.active).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('delay resolves when active and when deactivated', async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = new LevelSessionLifecycle();
      const activeDelay = lifecycle.delay(1000);

      await vi.advanceTimersByTimeAsync(1000);

      await expect(activeDelay).resolves.toBeUndefined();

      const cancelledDelay = lifecycle.delay(1000);
      let resolved = false;
      cancelledDelay.then(() => {
        resolved = true;
      });

      lifecycle.deactivate();
      await Promise.resolve();

      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test('consumeResetRequest returns true once after deactivation requests reset', () => {
    const lifecycle = new LevelSessionLifecycle();

    lifecycle.deactivate({ resetOnNextActivate: true });

    expect(lifecycle.consumeResetRequest()).toBe(true);
    expect(lifecycle.consumeResetRequest()).toBe(false);
  });
});
