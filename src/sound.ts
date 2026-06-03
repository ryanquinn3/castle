import type { Sound } from 'excalibur';

declare const __SOUNDS_DISABLED__: boolean;

const MUTE_STORAGE_KEY = 'castle.sound.muted';

let muted = readMutedState();

function getStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readMutedState(): boolean {
  try {
    return getStorage()?.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(nextMuted: boolean): void {
  muted = nextMuted;
  try {
    getStorage()?.setItem(MUTE_STORAGE_KEY, String(nextMuted));
  } catch {
    // Ignore storage failures; sound state still updates for this session.
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

// Gated by __SOUNDS_DISABLED__ (set in vitest.config.ts) so jsdom tests
// never touch Excalibur's Audio codepath, which requires a real browser.
export function playSound(sound: Sound): void {
  if ((typeof __SOUNDS_DISABLED__ !== 'undefined' && __SOUNDS_DISABLED__) || muted) {
    return;
  }
  sound.play();
}
