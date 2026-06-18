import { describe, expect, test } from 'vitest';
import { HealthComponent } from './health-component.ts';

describe('HealthComponent', () => {
  test('a new component starts at full health', () => {
    const c = new HealthComponent(75);
    expect(c.current).toBe(75);
    expect(c.fraction).toBe(1);
  });

  test('fraction reflects current over max', () => {
    const c = new HealthComponent(100);
    c.current = 50;
    expect(c.fraction).toBe(0.5);
    c.current = 0;
    expect(c.fraction).toBe(0);
  });

  test('fraction clamps to the 0..1 range', () => {
    const c = new HealthComponent(100);
    c.current = 150;
    expect(c.fraction).toBe(1);
    c.current = -10;
    expect(c.fraction).toBe(0);
  });
});
