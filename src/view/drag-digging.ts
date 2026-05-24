export interface Cell {
  col: number;
  row: number;
}

export function isOrthogonallyAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

export function canAddToSelection(selected: Cell[], candidate: Cell, max: number): boolean {
  if (selected.length >= max) {
    return false;
  }
  if (selected.some(c => c.col === candidate.col && c.row === candidate.row)) {
    return false;
  }
  const last = selected[selected.length - 1];
  return isOrthogonallyAdjacent(last, candidate);
}
