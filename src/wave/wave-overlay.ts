import { Actor, Canvas, Color, type Engine, Vector } from "excalibur";

interface GridParams {
  gridLeft: number;
  gridTop: number;
  tileSize: number;
  width: number;
  height: number;
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

    // Keep the body opaque (a depth gradient that never falls below ~0.35), but
    // feather ONLY the thin leading edge to transparent via a steep ramp at very
    // low depth. This removes the hard row-high step that made the advancing
    // front look blocky, without washing the whole wave out.
    float bodyAlpha = mix(0.35, 0.85, depth) * smoothstep(0.0, 0.12, depth);

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

}
