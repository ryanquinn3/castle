import type { Terrain } from '../model/terrain/terrain.ts';

export interface WaveSegmentSpawn {
  col: number;
  x: number;
  y: number;
  initialDepth: number;
}

export interface WaveSegmentGrid {
  gridLeft: number;
  gridTop: number;
  tileSize: number;
  height: number;
  getElevation(col: number, row: number): number;
  effectiveHoleDepth(col: number, row: number): number;
  isCastle(col: number, row: number): boolean;
}

export type WaveSegmentEvent =
  | { type: 'tileEntered'; col: number; row: number; depth: number }
  | { type: 'blocked'; col: number; row: number }
  | { type: 'overtopped'; col: number; row: number }
  | { type: 'absorbed'; col: number; row: number; absorbedDepth: number }
  | { type: 'castleFlooded'; col: number; row: number }
  | { type: 'tileCovered'; col: number; row: number }
  | { type: 'dissipated'; col: number; row: number }
  | { type: 'eroded'; col: number; row: number; hits: number };

export interface WaveEventApplyResult {
  castleFlooded: boolean;
  erodedTile: Terrain | null;
  sandRedistributed: boolean;
}

export interface WaveActorRuntimeResult {
  castleFlooded: boolean;
  erodedTiles: Terrain[];
  sandRedistributed: boolean;
}
