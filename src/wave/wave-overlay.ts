import { Actor, Canvas, Color, type Engine, ImageFiltering, Vector } from "excalibur";

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

// ---- tuning constants ----
// Uniform downstream scroll speed (noise units/sec). The surface is animated by
// a single uniform scroll, identical for every pixel. Per-pixel velocity-driven
// coordinate manipulation (advection or domain warp) was tried and removed: it
// folds/shears the noise wherever velocity varies sharply (around walls/towers),
// producing streaks, moire, and stripe seams. Uniform scroll has none of that.
const float SCROLL_SPEED     = 0.15;
// FBM octave count. Kept low: extra octaves add high-frequency normals that
// the specular term turns into salt-and-pepper grain. 3 broad octaves read as
// rolling ripples, not static.
const int   FBM_OCTAVES      = 3;
// Specular shininess exponent. Low + broad so glints are a soft sheen on ripple
// crests rather than a sharp per-pixel white dot.
const float SPEC_POWER       = 10.0;
// Caustic band brightness scale. Kept subtle so the water's light play does not
// overpower the rest of the game's flatter UI.
const float CAUSTIC_STRENGTH = 0.04;

// ---- hash / noise helpers ----
float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

// Smooth value noise in [0,1]
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave FBM; returns surface height h in [-~0.5, ~0.5]
float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < FBM_OCTAVES; i++) {
        val += (vnoise(p * freq) - 0.5) * amp;
        freq *= 2.0;
        amp  *= 0.5;
    }
    return val;
}

// Flowing FBM: a uniform downstream scroll animates the surface. Identical for
// every pixel, so it never shears or folds the noise.
float flowFbm(vec2 uv, float t) {
    vec2 scroll = vec2(0.0, -t * SCROLL_SPEED);
    return fbm(uv + scroll);
}

void main() {
    vec4 tex = texture(u_graphic, v_uv);
    // Channel layout: R=depth (0..1 normalized), G=opaque-ocean weight, B unused, A=wet mask
    float depth = tex.r;
    float ocean = tex.g;
    float wet   = tex.a;

    if (wet < 0.01 || depth <= 0.0) discard;

    float t = u_time_ms * 0.001; // seconds

    // ---- flowing FBM ripples ----
    // Lower spatial frequency (0.03) makes ripples big and coherent instead of a
    // fine grain the lighting sparkles on. Animated by a uniform scroll only.
    vec2 baseUV = v_uv * vec2(u_graphic_resolution.x, u_graphic_resolution.y) * 0.03;

    float h = flowFbm(baseUV, t);

    // ---- surface normal from FBM gradient (finite differences) ----
    // Sample the gradient over a wide step so the normal reflects the broad
    // swell, not the finest octave. A tiny eps reads the high-frequency noise
    // and produces per-pixel normal jitter -> specular grain.
    float eps = 0.05;
    float hx = flowFbm(baseUV + vec2(eps, 0.0), t) - flowFbm(baseUV - vec2(eps, 0.0), t);
    float hy = flowFbm(baseUV + vec2(0.0, eps), t) - flowFbm(baseUV - vec2(0.0, eps), t);
    vec3 normal = normalize(vec3(-hx / (2.0 * eps), -hy / (2.0 * eps), 1.0));

    // Fixed light + view directions (top-down pixel-art game; light from upper-left)
    vec3 lightDir = normalize(vec3(-0.4, -0.6, 1.0));
    vec3 viewDir  = vec3(0.0, 0.0, 1.0);

    // ---- diffuse + specular ----
    float diffuse  = max(0.0, dot(normal, lightDir));
    vec3  reflDir  = reflect(-lightDir, normal);
    float specular = pow(max(0.0, dot(reflDir, viewDir)), SPEC_POWER);

    // ---- caustic light bands ----
    // A second cheap noise scroll at a different frequency gives dappled caustics.
    vec2 causticUV = baseUV * 1.0 - vec2(0.3, 0.5) * t;
    float caustic  = pow(max(0.0, vnoise(causticUV) * 2.0 - 0.8), 1.5);
    // Caustics are stronger in deeper water
    caustic *= depth;

    // ---- depth tint ----
    // Deep = richer/darker blue, shallow = slightly lighter blue. Keep the two
    // close in hue/lightness: a wide contrast made shallow INTERIOR water (a
    // trough) render as a pale band against the deep water around it.
    vec3 deepColor    = u_color.rgb * vec3(0.65, 0.85, 1.1);
    vec3 shallowColor = u_color.rgb * vec3(1.12, 1.10, 1.05);
    vec3 waterColor   = mix(shallowColor, deepColor, depth);

    // Add diffuse shading
    waterColor *= mix(0.80, 1.10, diffuse);

    // ---- fresnel-ish shallow-edge lightening ----
    // Only the genuine near-dry rim (raw depth < ~0.3) gets a light touch of
    // brightening. A wider/stronger fresnel whitened all shallow water, turning
    // interior troughs into pale bands.
    float fresnel = 1.0 - smoothstep(0.0, 0.035, depth);
    waterColor = mix(waterColor, vec3(0.85, 0.95, 1.0) * 1.2, fresnel * 0.10);

    // Front foam only. (Velocity-gradient "obstacle foam" was removed: it fired
    // on the sim's structured/checkerboard velocity field across the fast top
    // band, amplifying it into a fine mesh/cross-hatch rather than only foaming
    // at walls. Foam now derives purely from the depth field.)
    vec2 texelSize = vec2(1.0 / u_graphic_resolution.x, 1.0 / u_graphic_resolution.y);

    // Front foam: a white cap only at the TRUE leading edge of the water body.
    // "Near dry just ahead" alone also fires on interior troughs (a shallow dip
    // that has water again below it), painting a thick foam band across the
    // middle that reads as "no water". Require it to also be dry FAR ahead, so a
    // trough (wet again downstream) is not mistaken for the front.
    float downNear = min(
        texture(u_graphic, v_uv + vec2(0.0, texelSize.y * 1.0)).r,
        texture(u_graphic, v_uv + vec2(0.0, texelSize.y * 2.0)).r
    );
    float downFar = max(
        texture(u_graphic, v_uv + vec2(0.0, texelSize.y * 6.0)).r,
        texture(u_graphic, v_uv + vec2(0.0, texelSize.y * 9.0)).r
    );
    float frontFoam = smoothstep(0.04, 0.0, downNear) * (1.0 - smoothstep(0.0, 0.05, downFar));

    // Animate foam slightly with the ripple height
    float foam = frontFoam * 0.9;
    foam *= 0.7 + 0.3 * (h + 0.5); // modulate by ripple crest

    vec3 foamColor = vec3(0.88, 0.96, 1.0);

    // ---- compose ----
    vec3 rgb = mix(waterColor, foamColor, foam);
    // Add specular glints and caustic dapples on top. Gate the specular to ripple
    // crests (high h) so glints land on the broad swell only, never as isolated
    // per-pixel sparks, and keep the contribution low so it reads as sheen.
    float crest = smoothstep(0.1, 0.45, h + 0.5);
    rgb += specular * crest * 0.10;
    rgb += caustic  * CAUSTIC_STRENGTH;

    // ---- alpha ----
    // Feather alpha only at genuinely near-dry depth (raw depth < ~0.2). A
    // higher threshold made shallow INTERIOR water — the troughs between the
    // surge front and the body behind it — drop to zero alpha, so the surface
    // read as "water, no water, water". Keep all wet-but-shallow water solid and
    // feather just the true outer rim.
    float edgeFeather = smoothstep(0.0, 0.025, depth);
    // Opacity floor keeps shallow water a solid blue body (no sand bleed-through).
    float bodyAlpha   = mix(0.72, 0.94, depth);
    float alpha       = bodyAlpha * edgeFeather * u_opacity;
    // Open-sea band (G channel) renders as solid water: force it to full
    // opacity so no sand/background bleeds through the ocean strip above row 0.
    alpha = mix(alpha, u_opacity, ocean);
    // Boost alpha at foam for opaque white caps
    alpha = min(1.0, alpha + foam * 0.3 * frontFoam);

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
      // Blended (linear) sampling: the game runs pixel-art (NEAREST) globally,
      // which makes the shader read velocity/depth as piecewise-constant per
      // texel. The flow advection then jumps at every texel boundary, showing as
      // a fine grid/moire in fast-moving water once the overlay is upscaled.
      // Linear sampling interpolates between texels so flow varies smoothly.
      filtering: ImageFiltering.Blended,
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
      // Base water blue matching the beach tileset's water (#568AE4). The shader
      // tints deeper/shallower from this via the depth ramp.
      color: Color.fromHex("#568AE4"),
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
