import { describe, expect, test } from 'vitest';
import { HealthComponent } from './health-component.ts';

describe('HealthComponent', () => {
  test('fraction is 1 at full health', () => {
    const c = new HealthComponent(100);
    expect(c.fraction).toBe(1);
  });

  test('fraction is 0.5 at half health', () => {
    const c = new HealthComponent(100);
    c.current = 50;
    expect(c.fraction).toBe(0.5);
  });

  test('fraction is 0 at zero health', () => {
    const c = new HealthComponent(100);
    c.current = 0;
    expect(c.fraction).toBe(0);
  });

  test('fraction clamps to 1 when current > max', () => {
    const c = new HealthComponent(100);
    c.current = 150;
    expect(c.fraction).toBe(1);
  });

  test('fraction clamps to 0 when current < 0', () => {
    const c = new HealthComponent(100);
    c.current = -10;
    expect(c.fraction).toBe(0);
  });

  test('max is readonly (set at construction)', () => {
    const c = new HealthComponent(50);
    expect(c.max).toBe(50);
  });

  test('current starts equal to max', () => {
    const c = new HealthComponent(75);
    expect(c.current).toBe(75);
  });
});
