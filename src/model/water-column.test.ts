import { describe, expect, test } from 'vitest';
import { WaterColumn } from './water-column.ts';

describe('WaterColumn', () => {
  describe('depth', () => {
    test('returns difference between surface and floor', () => {
      const col = new WaterColumn(0, 5);
      expect(col.depth).toBe(5);
    });

    test('returns zero when surface equals floor', () => {
      const col = new WaterColumn(3, 3);
      expect(col.depth).toBe(0);
    });

    test('returns positive depth with elevated floor', () => {
      const col = new WaterColumn(2, 7);
      expect(col.depth).toBe(5);
    });
  });

  describe('applyTerrain', () => {
    test('blocks when elevation meets surface level', () => {
      const col = new WaterColumn(0, 4);
      const event = col.applyTerrain(4);
      expect(event).toBe('blocked');
      expect(col.depth).toBe(0);
    });

    test('blocks when elevation exceeds surface level', () => {
      const col = new WaterColumn(0, 4);
      const event = col.applyTerrain(6);
      expect(event).toBe('blocked');
      expect(col.depth).toBe(0);
      expect(col.surfaceLevel).toBe(col.floorLevel);
    });

    test('overtops when elevation is between floor and surface', () => {
      const col = new WaterColumn(0, 5);
      const event = col.applyTerrain(3);
      expect(event).toBe('overtopped');
      expect(col.floorLevel).toBe(3);
      expect(col.surfaceLevel).toBe(5);
      expect(col.depth).toBe(2);
    });

    test('passes through when elevation equals floor', () => {
      const col = new WaterColumn(0, 5);
      const event = col.applyTerrain(0);
      expect(event).toBeNull();
      expect(col.floorLevel).toBe(0);
      expect(col.surfaceLevel).toBe(5);
    });

    test('passes through when elevation is below floor', () => {
      const col = new WaterColumn(2, 5);
      const event = col.applyTerrain(1);
      expect(event).toBeNull();
      expect(col.floorLevel).toBe(1);
      expect(col.surfaceLevel).toBe(5);
    });

    test('clamps floor to zero on negative elevation', () => {
      const col = new WaterColumn(0, 5);
      const event = col.applyTerrain(-3);
      expect(event).toBeNull();
      expect(col.floorLevel).toBe(0);
    });
  });

  describe('advanceRow', () => {
    test('raises floor by terrain slope', () => {
      const col = new WaterColumn(0, 5);
      col.advanceRow(2);
      expect(col.floorLevel).toBe(2);
      expect(col.surfaceLevel).toBe(5);
      expect(col.depth).toBe(3);
    });

    test('eliminates water when slope raises floor to surface', () => {
      const col = new WaterColumn(0, 3);
      col.advanceRow(3);
      expect(col.isEmpty()).toBe(true);
      expect(col.surfaceLevel).toBe(col.floorLevel);
    });

    test('eliminates water when slope raises floor past surface', () => {
      const col = new WaterColumn(0, 3);
      col.advanceRow(5);
      expect(col.isEmpty()).toBe(true);
      expect(col.surfaceLevel).toBe(5);
    });

    test('handles negative slope', () => {
      const col = new WaterColumn(2, 5);
      col.advanceRow(-1);
      expect(col.floorLevel).toBe(1);
      expect(col.surfaceLevel).toBe(5);
      expect(col.depth).toBe(4);
    });
  });

  describe('isEmpty', () => {
    test('returns true when depth is zero', () => {
      const col = new WaterColumn(3, 3);
      expect(col.isEmpty()).toBe(true);
    });

    test('returns false when depth is positive', () => {
      const col = new WaterColumn(0, 1);
      expect(col.isEmpty()).toBe(false);
    });

    test('returns true after being fully blocked', () => {
      const col = new WaterColumn(0, 4);
      col.applyTerrain(4);
      expect(col.isEmpty()).toBe(true);
    });
  });
});
