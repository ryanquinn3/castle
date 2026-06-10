import type { Terrain } from '../model/terrain/terrain.ts';

export type WaveState = 'surging' | 'crashing' | 'receding' | 'still' | 'dead';

export interface WaveSegmentSpawn {
  col: number;
  x: number;
  y: number;
  initialDepth: number;
  speed: number;
  recedeSpeed: number;
  maxTravelDistance: number;
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
  | { type: 'tileEntered'; col: number; row: number; depth: number; alpha: number }
  | { type: 'blocked'; col: number; row: number; depth: number; alpha: number }
  | { type: 'overtopped'; col: number; row: number; depth: number; alpha: number }
  | { type: 'absorbed'; col: number; row: number; depth: number; absorbedDepth: number; alpha: number }
  | { type: 'castleFlooded'; col: number; row: number; depth: number; alpha: number }
  | { type: 'tileCovered'; col: number; row: number; depth: number; alpha: number }
  | { type: 'dissipated'; col: number; row: number };

export interface WaveEventApplyResult {
  castleFlooded: boolean;
  erodedTile: Terrain | null;
  sandRedistributed: boolean;
}

export interface WaveActorRuntimeResult {
  castleFlooded: boolean;
  erodedTiles: Terrain[];
  sandRedistributed: boolean;
  events: WaveSegmentEvent[];
}
