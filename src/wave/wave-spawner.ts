import {
  WAVE_FRONT_NOISE_AMPLITUDE,
  WAVE_FRONT_NOISE_FREQUENCY,
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
  }));
}
