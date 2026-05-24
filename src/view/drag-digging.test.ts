import { describe, it, expect } from 'vitest';
import { isOrthogonallyAdjacent, canAddToSelection } from './drag-digging.ts';

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
