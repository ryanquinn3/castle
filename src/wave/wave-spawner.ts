import {
  WAVE_FRONT_NOISE_AMPLITUDE,
  WAVE_FRONT_NOISE_FREQUENCY,
  WAVE_SEGMENT_BASE_TRAVEL,
  WAVE_SEGMENT_RECEDE_SPEED,
  WAVE_SEGMENT_SURGE_SPEED,
  WAVE_SEGMENT_TRAVEL_PER_DEPTH,
} from '../config.ts';
import { generateWaveCurve } from '../model/wave-simulation.ts';
import type { WaveSegmentSpawn } from './wave-segment-types.ts';

export interface GenerateWaveSegmentSpawnsInput {
  numCols: number;
  tileSize: number;
  gridLeft: number;
  gridTop: number;
  peakHeight: number;
  valleyFraction: number;
  peakPhase: number;
  numPeaks: number;
  waveIndex: number;
}

function frontNoise(col: number, waveIndex: number): number {
  const seed = Math.sin((col * 12.9898 + waveIndex * 78.233) * WAVE_FRONT_NOISE_FREQUENCY) * 43758.5453;
  return (seed - Math.floor(seed)) * 2 - 1;
}

export function generateWaveSegmentSpawns(input: GenerateWaveSegmentSpawnsInput): WaveSegmentSpawn[] {
  const depths = generateWaveCurve(
    input.numCols,
    input.peakHeight,
    input.valleyFraction,
    input.peakPhase,
    input.numPeaks,
  );
  const ySpawnBase = input.gridTop - input.tileSize / 2;

  return depths.map((initialDepth, col) => ({
    col,
    x: input.gridLeft + col * input.tileSize + input.tileSize / 2,
    y: Math.min(
      input.gridTop - 1,
      ySpawnBase + frontNoise(col, input.waveIndex) * WAVE_FRONT_NOISE_AMPLITUDE,
    ),
    initialDepth,
    speed: WAVE_SEGMENT_SURGE_SPEED,
    recedeSpeed: WAVE_SEGMENT_RECEDE_SPEED,
    maxTravelDistance: WAVE_SEGMENT_BASE_TRAVEL + initialDepth * WAVE_SEGMENT_TRAVEL_PER_DEPTH,
  }));
}
