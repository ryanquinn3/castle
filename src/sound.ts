import type { Sound } from 'excalibur';

declare const __SOUNDS_DISABLED__: boolean;

// Gated by __SOUNDS_DISABLED__ (set in vitest.config.ts) so jsdom tests
// never touch Excalibur's Audio codepath, which requires a real browser.
export function playSound(sound: Sound): void {
  if (typeof __SOUNDS_DISABLED__ !== 'undefined' && __SOUNDS_DISABLED__) {
    return;
  }
  sound.play();
}
