import { describe, it, expect, test as baseTest, vi } from 'vitest';
import { isOrthogonallyAdjacent, canAddToSelection, DragDigging } from './drag-digging.ts';
import type { DiggingStrategy } from './digging-strategy.ts';

describe('isOrthogonallyAdjacent', () => {
  it('returns true for cells sharing an edge', () => {
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 2, row: 1 })).toBe(true);
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 1, row: 2 })).toBe(true);
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 0, row: 1 })).toBe(true);
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 1, row: 0 })).toBe(true);
  });

  it('returns false for diagonal cells', () => {
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 2, row: 2 })).toBe(false);
  });

  it('returns false for same cell', () => {
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 1, row: 1 })).toBe(false);
  });

  it('returns false for distant cells', () => {
    expect(isOrthogonallyAdjacent({ col: 1, row: 1 }, { col: 3, row: 1 })).toBe(false);
  });
});

describe('canAddToSelection', () => {
  it('allows adding adjacent cell when under max', () => {
    const selected = [{ col: 1, row: 1 }];
    expect(canAddToSelection(selected, { col: 2, row: 1 }, 3)).toBe(true);
  });

  it('rejects when at max', () => {
    const selected = [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }];
    expect(canAddToSelection(selected, { col: 4, row: 1 }, 3)).toBe(false);
  });

  it('rejects non-adjacent cell', () => {
    const selected = [{ col: 1, row: 1 }];
    expect(canAddToSelection(selected, { col: 3, row: 1 }, 3)).toBe(false);
  });

  it('rejects already-selected cell', () => {
    const selected = [{ col: 1, row: 1 }];
    expect(canAddToSelection(selected, { col: 1, row: 1 }, 3)).toBe(false);
  });

  it('checks adjacency against last cell only', () => {
    const selected = [{ col: 1, row: 1 }, { col: 2, row: 1 }];
    expect(canAddToSelection(selected, { col: 1, row: 2 }, 3)).toBe(false);
    expect(canAddToSelection(selected, { col: 3, row: 1 }, 3)).toBe(true);
  });
});

describe('DragDigging', () => {
  it('implements DiggingStrategy with lock and unlock', () => {
    const strategy: DiggingStrategy = new DragDigging();
    expect(strategy.lock).toBeDefined();
    expect(strategy.unlock).toBeDefined();
  });

  it('getStateText returns default text before activation', () => {
    const dd = new DragDigging();
    expect(dd.getStateText()).toBe('Click and drag to scoop tiles');
  });
});

describe('DragDigging lock/unlock with active session', () => {
  function makeTileStub(col: number, row: number) {
    return {
      col,
      row,
      isCastle: false,
      graphics: { use: vi.fn(), opacity: 1.0 },
      on: vi.fn(),
      off: vi.fn(),
    };
  }

  function makeGridStub(tiles: Map<string, ReturnType<typeof makeTileStub>>) {
    return {
      getTile: (c: number, r: number) => tiles.get(`${c},${r}`) ?? null,
      setElevation: vi.fn(),
      refreshTileVisual: vi.fn(),
      model: { getPoolNeighbors: () => null },
    };
  }

  function makeCanvasStub(): { style: { cursor: string } } {
    return { style: { cursor: '' } };
  }

  function makeSceneStub(canvas: ReturnType<typeof makeCanvasStub>) {
    return {
      engine: { canvas },
      input: {
        pointers: {
          primary: {
            on: vi.fn(),
            off: vi.fn(),
          },
        },
      },
    };
  }

  const test = baseTest.extend<{
    canvas: ReturnType<typeof makeCanvasStub>;
    tiles: Map<string, ReturnType<typeof makeTileStub>>;
    gridStub: ReturnType<typeof makeGridStub>;
    sceneStub: ReturnType<typeof makeSceneStub>;
    dd: DragDigging;
  }>({
    canvas: async ({}, use) => {
      await use(makeCanvasStub());
    },
    tiles: async ({}, use) => {
      const m = new Map<string, ReturnType<typeof makeTileStub>>();
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          m.set(`${c},${r}`, makeTileStub(c, r));
        }
      }
      await use(m);
    },
    gridStub: async ({ tiles }, use) => {
      await use(makeGridStub(tiles));
    },
    sceneStub: async ({ canvas }, use) => {
      await use(makeSceneStub(canvas));
    },
    dd: async ({ sceneStub, gridStub }, use) => {
      const dd = new DragDigging();
      dd.activate(sceneStub as any, gridStub as any, { delta: 1 });
      await use(dd);
    },
  });

  test('lock resets cursor to default', ({ dd, canvas }) => {
    expect(canvas.style.cursor).toContain('url(');
    dd.lock();
    expect(canvas.style.cursor).toBe('');
  });

  test('unlock restores scoop cursor', ({ dd, canvas }) => {
    dd.lock();
    expect(canvas.style.cursor).toBe('');
    dd.unlock();
    expect(canvas.style.cursor).toContain('url(');
  });

  test('lock clears state back to idle', ({ dd }) => {
    dd.lock();
    expect(dd.getStateText()).toBe('Click and drag to scoop tiles');
  });

  test('deactivate does not call setElevation for pending selection', ({ dd, gridStub, sceneStub }) => {
    dd.deactivate(sceneStub as any);
    expect(gridStub.setElevation).not.toHaveBeenCalled();
  });
});
