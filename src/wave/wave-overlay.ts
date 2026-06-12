import { Actor, Canvas, Color, type Engine, Vector } from "excalibur";
import type { WaveState } from "./wave-segment-types.ts";

const DEPTH_NORMALIZE = 9;
const FOAM_PIXELS = 4;

interface GridParams {
  gridLeft: number;
  gridTop: number;
  tileSize: number;
  width: number;
  height: number;
}

export interface SegmentData {
  col: number;
  pixelY: number;
  currentDepth: number;
  state: WaveState;
  tileSize: number;
}

export function buildCoverageData(
  segments: SegmentData[],
  gridWidth: number,
  gridHeight: number,
): Uint8ClampedArray {
  const pixelW = gridWidth;
  const pixelH = gridHeight;
  const data = new Uint8ClampedArray(pixelW * pixelH * 4);

  if (segments.length === 0) {
    return data;
  }

  const colBuckets = new Map<number, SegmentData[]>();
  for (const seg of segments) {
    let bucket = colBuckets.get(seg.col);
    if (!bucket) {
      bucket = [];
      colBuckets.set(seg.col, bucket);
    }
    bucket.push(seg);
  }

  const tileSize = segments[0].tileSize;
  const colCount = Math.ceil(pixelW / tileSize);

  const colDepths = new Float32Array(colCount);
  const colTops = new Float32Array(colCount).fill(pixelH);
  const colBottoms = new Float32Array(colCount).fill(0);

  for (const [col, segs] of colBuckets) {
    if (col < 0 || col >= colCount) {
      continue;
    }

    let maxDepth = 0;
    let bottomY = 0;

    for (const seg of segs) {
      if (seg.currentDepth > maxDepth) {
        maxDepth = seg.currentDepth;
      }
      const segBottom = seg.pixelY + tileSize / 2;
      if (segBottom > bottomY) {
        bottomY = segBottom;
      }
    }

    colDepths[col] = maxDepth;
    colTops[col] = 0;
    colBottoms[col] = Math.max(0, Math.min(pixelH, bottomY));
  }

  const colSample = (arr: Float32Array, i: number, fallback: number) =>
    i >= 0 && i < colCount ? arr[i] : fallback;

  const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  };

  for (let px = 0; px < pixelW; px++) {
    const colExact = px / tileSize;
    const c1 = Math.floor(colExact);
    const c2 = Math.min(c1 + 1, colCount - 1);
    const t = colExact - c1;
    const c0 = c1 - 1;
    const c3 = c2 + 1;

    const d1 = colDepths[c1] ?? 0;
    const d2 = colDepths[c2] ?? 0;
    const hasLeft = d1 > 0;
    const hasRight = d2 > 0;

    if (!hasLeft && !hasRight) {
      continue;
    }

    let depth: number;
    let top: number;
    let bottom: number;
    if (hasLeft && hasRight) {
      depth = catmullRom(
        colSample(colDepths, c0, d1), d1, d2,
        colSample(colDepths, c3, d2), t,
      );
      top = catmullRom(
        colSample(colTops, c0, colTops[c1]), colTops[c1], colTops[c2],
        colSample(colTops, c3, colTops[c2]), t,
      );
      bottom = catmullRom(
        colSample(colBottoms, c0, colBottoms[c1]), colBottoms[c1], colBottoms[c2],
        colSample(colBottoms, c3, colBottoms[c2]), t,
      );
    } else if (hasLeft) {
      depth = d1;
      top = colTops[c1];
      bottom = colBottoms[c1];
    } else {
      depth = d2;
      top = colTops[c2];
      bottom = colBottoms[c2];
    }

    if (depth <= 0) {
      continue;
    }

    top = Math.max(0, top);
    bottom = Math.min(pixelH, bottom);
    const normDepth = Math.min(depth / DEPTH_NORMALIZE, 1);

    for (let py = 0; py < pixelH; py++) {
      if (py < top || py > bottom) {
        continue;
      }

      const idx = (py * pixelW + px) * 4;

      const distFromFront = bottom - py;

      data[idx] = Math.round(normDepth * 255);

      if (distFromFront < FOAM_PIXELS) {
        const foamIntensity = 1 - distFromFront / FOAM_PIXELS;
        data[idx + 1] = Math.round(foamIntensity * 255);
      }

      let coverage = 1;
      if (!hasLeft || !hasRight) {
        const withinTile = px - c1 * tileSize;
        const edgeDist = !hasLeft ? withinTile : tileSize - withinTile;
        coverage = Math.min(1, edgeDist / 3);
      }

      data[idx + 2] = Math.round(coverage * 255);
      data[idx + 3] = 255;
    }
  }

  return data;
}

const WAVE_FRAGMENT_SOURCE = `#version 300 es
precision mediump float;

uniform sampler2D u_graphic;
uniform float u_time_ms;
uniform vec4 u_color;
uniform float u_opacity;
uniform vec2 u_graphic_resolution;

in vec2 v_uv;
out vec4 fragColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec4 tex = texture(u_graphic, v_uv);
    float depth = tex.r;
    float edge  = tex.g;
    float cover = tex.b;

    if (cover < 0.01) discard;

    float t = u_time_ms * 0.001;

    float edgeFade = smoothstep(0.0, 0.15, cover);
    float lateralFade = mix(edgeFade, 1.0, smoothstep(0.0, 0.3, edge));

    float bodyAlpha = mix(0.2, 0.85, depth);

    vec3 waterColor = u_color.rgb;
    waterColor = mix(waterColor * 1.15, waterColor * 0.9, depth);

    vec2 pixelPos = v_uv * u_graphic_resolution;
    float noiseVal = hash(floor(pixelPos * 0.5) + floor(t * 3.0));
    float shimmer = sin(pixelPos.x * 0.8 + t * 4.0 + noiseVal * 6.28) * 0.3 + 0.7;

    float foam = smoothstep(0.0, 0.2, edge) * smoothstep(1.2, 0.4, edge);
    foam *= shimmer;

    vec3 foamColor = vec3(0.85, 0.95, 1.0);

    vec3 rgb = mix(waterColor, foamColor, foam * 0.7);
    float alpha = bodyAlpha * lateralFade * u_opacity * cover;

    alpha = min(1.0, alpha + foam * 0.3 * edge);

    fragColor = vec4(rgb * alpha, alpha);
}
`;

export class WaveOverlay extends Actor {
  readonly pixelW: number;
  readonly pixelH: number;
  private currentImageData: ImageData | null = null;

  /**
   * When set, called each frame to produce the overlay buffer (legacy column path).
   * Do not set this alongside direct setCoverage calls — only one driver should be active.
   */
  coverageProvider: (() => Uint8ClampedArray) | null = null;

  constructor(params: GridParams) {
    const pixelW = params.width * params.tileSize;
    const pixelH = (params.height + 1) * params.tileSize;
    const overlayTop = params.gridTop - params.tileSize;

    super({
      pos: new Vector(params.gridLeft + pixelW / 2, overlayTop + pixelH / 2),
      width: pixelW,
      height: pixelH,
      z: 7,
      name: "WaveOverlay",
    });

    this.pixelW = pixelW;
    this.pixelH = pixelH;

    const canvas = new Canvas({
      width: pixelW,
      height: pixelH,
      cache: false,
      draw: (ctx) => {
        if (this.currentImageData) {
          ctx.putImageData(this.currentImageData, 0, 0);
        }
      },
    });
    this.graphics.use(canvas);
  }

  override onInitialize(engine: Engine): void {
    const material = engine.graphicsContext.createMaterial({
      name: "wave-overlay",
      fragmentSource: WAVE_FRAGMENT_SOURCE,
      color: Color.fromRGB(60, 120, 220),
    });
    this.graphics.material = material;
  }

  /** Drive the overlay buffer directly (field render path). */
  setCoverage(rgba: Uint8ClampedArray): void {
    this.currentImageData = new ImageData(
      rgba as Uint8ClampedArray<ArrayBuffer>,
      this.pixelW,
      this.pixelH,
    );
  }

  /** Test helper: the last image data computed for the overlay. */
  debugImageData(): ImageData | null {
    return this.currentImageData;
  }

  override onPreUpdate(): void {
    if (this.coverageProvider) {
      this.setCoverage(this.coverageProvider());
    }
  }
}
