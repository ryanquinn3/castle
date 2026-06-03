import type { Sound } from 'excalibur';
import { beforeEach, describe, expect, test, vi } from 'vitest';

async function loadSoundModule() {
  vi.resetModules();
  return import('./sound.ts');
}

function installLocalStorage(): Storage {
  const values = new Map<string, string>();
  const storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as Storage;

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

describe('sound', () => {
  const localStorage = installLocalStorage();

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test('playSound does not call play when muted', async () => {
    const { playSound, setMuted } = await loadSoundModule();
    const sound = { play: vi.fn<() => void>() } as unknown as Sound;

    setMuted(true);
    playSound(sound);

    expect(sound.play).not.toHaveBeenCalled();
  });

  test('setMuted persists to localStorage', async () => {
    const { setMuted } = await loadSoundModule();

    setMuted(true);

    const { isMuted } = await loadSoundModule();
    expect(isMuted()).toBe(true);
  });

  test('saved muted state is read on startup', async () => {
    localStorage.setItem('castle.sound.muted', 'true');

    const { isMuted } = await loadSoundModule();

    expect(isMuted()).toBe(true);
  });

  test('storage read failures leave sound unmuted', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    const { isMuted } = await loadSoundModule();

    expect(isMuted()).toBe(false);
  });
});
