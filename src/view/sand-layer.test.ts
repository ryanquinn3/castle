import { describe, expect, test } from 'vitest';
import { ImageSource } from 'excalibur';
import { SandLayer } from './sand-layer.ts';

function makeStubImage(): ImageSource {
  return { isLoaded: () => false, ready: Promise.resolve() } as unknown as ImageSource;
}

function makeStubScene() {
  const added: unknown[] = [];
  return {
    scene: { add: (item: unknown) => { added.push(item); }, added } as unknown as import('excalibur').Scene & { added: unknown[] },
    added,
  };
}

describe('SandLayer', () => {
  test('adds a TileMap to the scene', () => {
    const { scene, added } = makeStubScene();
    new SandLayer(scene, 0, 0, 1, makeStubImage());
    expect(added).toHaveLength(1);
  });

  test('clearCell does not throw for in-bounds game rows', () => {
    const { scene } = makeStubScene();
    const layer = new SandLayer(scene, 0, 0, 1, makeStubImage());
    expect(() => layer.clearCell(0, 3)).not.toThrow();
    expect(() => layer.clearCell(15, 15)).not.toThrow();
  });

  test('clearCell does not throw for out-of-bounds rows', () => {
    const { scene } = makeStubScene();
    const layer = new SandLayer(scene, 0, 0, 1, makeStubImage());
    expect(() => layer.clearCell(0, -1)).not.toThrow();
    expect(() => layer.clearCell(0, 99)).not.toThrow();
  });
});
