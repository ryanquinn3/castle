#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { simulateWave } from "../src/model/wave-simulation.ts";

const TERRAIN_SLOPE = 0.5;

interface BoardState {
  castleCol: number;
  castleRow: number;
  elevations: number[][];
  columnHeights: number[];
}

function parse(input: string): BoardState {
  return JSON.parse(input) as BoardState;
}

function formatGrid(
  label: string,
  grid: number[][],
  elevations: number[][],
): string {
  const header = `\n--- ${label} ---`;
  const rows = grid.map((row, r) =>
    row
      .map((v, c) => {
        if (v === 0 && elevations[r][c] === 0) {
          return "   .";
        }
        return v.toFixed(1).padStart(5);
      })
      .join(""),
  );
  return `${header}\n${rows.join("\n")}`;
}

const input = readFileSync(process.argv[2] ?? "/dev/stdin", "utf-8");
const { columnHeights, elevations, castleCol, castleRow } = parse(input);
const numRows = elevations.length;

const puddleDepths = elevations.map((row) => row.map(() => 0));

const poolMap = new Map<string, { members: { col: number; row: number }[] }>();
const visited = new Set<string>();
for (let row = 0; row < elevations.length; row++) {
  for (let col = 0; col < elevations[row].length; col++) {
    if (elevations[row][col] >= 0) {
      continue;
    }
    const key = `${col}:${row}`;
    if (visited.has(key)) {
      continue;
    }
    const members: { col: number; row: number }[] = [];
    const queue = [{ col, row }];
    visited.add(key);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      members.push(cur);
      for (const [dc, dr] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        const nk = `${nc}:${nr}`;
        if (
          visited.has(nk) ||
          nr < 0 ||
          nr >= elevations.length ||
          nc < 0 ||
          nc >= elevations[0].length
        ) {
          continue;
        }
        if (elevations[nr][nc] >= 0) {
          continue;
        }
        visited.add(nk);
        queue.push({ col: nc, row: nr });
      }
    }
    const pool = { members };
    for (const m of members) {
      poolMap.set(`${m.col}:${m.row}`, pool);
    }
  }
}

const result = simulateWave({
  elevations,
  puddleDepths,
  columnHeights,
  castleCol,
  castleRow,
  maxRows: numRows,
  terrainSlope: TERRAIN_SLOPE,
  poolMap,
});

console.log(`Castle flooded: ${result.castleFlooded}`);

console.log("\n--- Wave Input (column heights) ---");
console.log(columnHeights.map((h) => h.toFixed(1).padStart(5)).join(""));

console.log("\n--- Elevations ---");
for (const row of elevations) {
  console.log(row.map((e) => e.toString().padStart(4)).join(""));
}

console.log(
  formatGrid("Advance Water Height", result.advanceHeightMap, elevations),
);
console.log(
  formatGrid("Recede Water Height", result.recedeHeightMap, elevations),
);
console.log(formatGrid("Puddle Delta", result.puddleDelta, elevations));

const erosionRows = result.wallErosionEvents
  .map((row, r) => {
    const events = row
      .map((e, c) => (e ? `(${c},${r}):${e}` : null))
      .filter(Boolean);
    return events.length > 0 ? events.join(" ") : null;
  })
  .filter(Boolean);

if (erosionRows.length > 0) {
  console.log("\n--- Wall Erosion Events ---");
  for (const line of erosionRows) {
    console.log(line);
  }
}
