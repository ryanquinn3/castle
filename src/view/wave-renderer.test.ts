import { describe, expect, test, vi, type Mock } from 'vitest';
import type { Scene } from 'excalibur';
import { WaveRenderer } from './wave-renderer.ts';
import type { GridModel } from '../model/grid-model.ts';
import type { Terrain } from '../model/terrain/terrain.ts';
import type { WallErosionEvent } from '../model/wave-simulation.ts';
import { CASTLE_COL, CASTLE_ROW, CASTLE_WIDTH, CASTLE_HEIGHT, computeLayout } from '../config.ts';

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

vi.mock('../model/grid-model.ts', () => ({
  GridModel: class {},
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

describe('buildCastleFlashOverlays', () => {
  test('returns one actor per castle cell, each at z=7 above castle sprite (z=1), centered on castle cells', () => {
    const scene = makeScene();
    const renderer = new WaveRenderer({} as GridModel, scene);

    const overlays = renderer.buildCastleFlashOverlays();

    expect(overlays).toHaveLength(CASTLE_WIDTH * CASTLE_HEIGHT);

    const { tileSize: TILE_SIZE, gridLeft: GRID_LEFT, gridTop: GRID_TOP } = computeLayout(window);

    let idx = 0;
    for (let dr = 0; dr < CASTLE_HEIGHT; dr++) {
      for (let dc = 0; dc < CASTLE_WIDTH; dc++) {
        const actor = overlays[idx++] as unknown as { options: { z: number; pos: { x: number; y: number } } };
        expect(actor.options.z).toBe(7);
        expect(actor.options.z).toBeGreaterThan(1);
        expect(actor.options.pos.x).toBeCloseTo(GRID_LEFT + (CASTLE_COL + dc + 0.5) * TILE_SIZE);
        expect(actor.options.pos.y).toBeCloseTo(GRID_TOP + (CASTLE_ROW + dr + 0.5) * TILE_SIZE);
      }
    }
  });
});

describe('WaveRenderer cleanup', () => {
  test('uses injected delay provider and removes eroded flash actors during cleanup', () => {
    const scene = makeScene();
    const delay = pendingDelay();
    const renderer = new WaveRenderer({} as GridModel, scene, delay);

    void renderer.flashErodedTiles([{ col: 2, row: 3 } as unknown as Terrain]);
    const actor = scene.add.mock.calls[0][0];

    renderer.cleanup();

    expect(delay).toHaveBeenCalledWith(350);
    expect(scene.remove).toHaveBeenCalledWith(actor);
  });

  test('removes sand redistribution flash actors during cleanup', () => {
    const scene = makeScene();
    const delay = pendingDelay();
    const renderer = new WaveRenderer({} as GridModel, scene, delay);
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
