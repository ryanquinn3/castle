import { describe, expect, test } from 'vitest';
import { InventoryModel } from './inventory-model.ts';

describe('InventoryModel', () => {
  test('starts with 0 sand', () => {
    const inv = new InventoryModel();
    expect(inv.sand).toBe(0);
  });

  test('addSand increases count', () => {
    const inv = new InventoryModel();
    inv.addSand(3);
    expect(inv.sand).toBe(3);
  });

  test('removeSand decreases count', () => {
    const inv = new InventoryModel();
    inv.addSand(5);
    inv.removeSand(2);
    expect(inv.sand).toBe(3);
  });

  test('removeSand returns false when insufficient', () => {
    const inv = new InventoryModel();
    inv.addSand(1);
    expect(inv.removeSand(2)).toBe(false);
    expect(inv.sand).toBe(1);
  });

  test('removeSand returns true on success', () => {
    const inv = new InventoryModel();
    inv.addSand(5);
    expect(inv.removeSand(3)).toBe(true);
  });

  test('hasSand reflects inventory state', () => {
    const inv = new InventoryModel();
    expect(inv.hasSand).toBe(false);
    inv.addSand(1);
    expect(inv.hasSand).toBe(true);
  });

  test('persists across multiple add/remove cycles', () => {
    const inv = new InventoryModel();
    inv.addSand(10);
    inv.removeSand(3);
    inv.addSand(2);
    inv.removeSand(5);
    expect(inv.sand).toBe(4);
  });
});
