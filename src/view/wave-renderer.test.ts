import { describe, expect, test, vi, type Mock } from 'vitest';
import type { Scene } from 'excalibur';
import { WaveRenderer } from './wave-renderer.ts';
import type { GridView } from './grid-view.ts';
import type { Tile } from './tile.ts';
import type { WallErosionEvent } from '../model/wave-simulation.ts';

vi.mock('excalibur', () => {
  class Actor {
    graphics = { use: vi.fn<(graphic: unknown) => void>() };
    actions = {
      fade: vi.fn<(opacity: number, duration: number) => { callMethod: Mock<(callback: () => void) => void> }>(() => ({
        callMethod: vi.fn<(callback: () => void) => void>(),
      })),
    };

    constructor(public options?: unknown) {}

    addChild = vi.fn<(child: unknown) => void>();
  }

  return {
    Actor,
    Canvas: class {},
    Component: class {},
    Color: {
      Red: 'red',
      White: 'white',
      fromRGB: vi.fn<(...args: unknown[]) => { args: unknown[] }>((...args: unknown[]) => ({ args })),
    },
    Font: class {},
    ImageSource: class {
      constructor(_path: string) {}
    },
    Loader: class {
      suppressPlayButton = false;
      constructor(_resources: unknown[]) {}
    },
    Rectangle: class {},
    Sound: class {
      constructor(_path: string) {}
    },
    Text: class {},
    Vector: class {
      constructor(public x: number, public y: number) {}
    },
  };
});

vi.mock('./tile.ts', () => ({
  Tile: class {},
}));

vi.mock('./grid-view.ts', () => ({
  GridView: class {},
}));

type SceneStub = Scene & {
  add: Mock<(actor: unknown) => void>;
  remove: Mock<(actor: unknown) => void>;
};

function makeScene(): SceneStub {
  return {
    add: vi.fn<(actor: unknown) => void>(),
    remove: vi.fn<(actor: unknown) => void>(),
  } as unknown as SceneStub;
}

function pendingDelay(): (ms: number) => Promise<void> {
  return vi.fn<(_ms: number) => Promise<void>>(() => new Promise(() => {}));
}

describe('WaveRenderer cleanup', () => {
  test('uses injected delay provider and removes eroded flash actors during cleanup', () => {
    const scene = makeScene();
    const delay = pendingDelay();
    const renderer = new WaveRenderer({} as GridView, scene, delay);

    void renderer.flashErodedTiles([{ col: 2, row: 3 } as Tile]);
    const actor = scene.add.mock.calls[0][0];

    renderer.cleanup();

    expect(delay).toHaveBeenCalledWith(350);
    expect(scene.remove).toHaveBeenCalledWith(actor);
  });

  test('removes sand redistribution flash actors during cleanup', () => {
    const scene = makeScene();
    const delay = pendingDelay();
    const renderer = new WaveRenderer({} as GridView, scene, delay);
    const events: WallErosionEvent[][] = [[null, 'blocked']];

    void renderer.flashSandRedistribution(events);
    const actors = scene.add.mock.calls.map(([actor]) => actor);

    renderer.cleanup();

    expect(delay).toHaveBeenCalledWith(260);
    expect(actors.length).toBeGreaterThan(0);
    for (const actor of actors) {
      expect(scene.remove).toHaveBeenCalledWith(actor);
    }
  });
});
