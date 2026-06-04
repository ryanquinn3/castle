import { describe, expect, test } from 'vitest';
import { computeLayout, TILEMAP_ROWS, TOOLBAR_RESERVED_HEIGHT } from './config.ts';

describe('computeLayout', () => {
  test('tall viewport: toolbar fits without shrinking tile size', () => {
    const layout = computeLayout({ innerWidth: 1200, innerHeight: 1000 });
    expect(layout.tileSize).toBe(36);
    const sandBottom = layout.mapTop + TILEMAP_ROWS * layout.tileSize;
    expect(sandBottom + TOOLBAR_RESERVED_HEIGHT).toBeLessThanOrEqual(1000);
  });

  test('short viewport: tile shrinks so grid plus toolbar fit', () => {
    const tall = computeLayout({ innerWidth: 1200, innerHeight: 1000 });
    const short = computeLayout({ innerWidth: 1200, innerHeight: 600 });
    expect(short.tileSize).toBeLessThan(tall.tileSize);
    const sandBottom = short.mapTop + TILEMAP_ROWS * short.tileSize;
    expect(sandBottom + TOOLBAR_RESERVED_HEIGHT).toBeLessThanOrEqual(600);
  });
});
