import type {
  CaptureFormat,
  CaptureOptions,
  CaptureResult,
  ClockMode,
  DprOption,
  Resolution,
  ShaderLayer,
  ShaderStatus,
  TextureInput,
  TimeSource,
  UniformInput,
  UniformSource
} from "@frapx/core";

export type {
  CaptureFormat,
  CaptureOptions,
  CaptureResult,
  ClockMode,
  DprOption,
  Resolution,
  ShaderLayer,
  ShaderStatus,
  TextureInput,
  TimeSource,
  UniformInput
} from "@frapx/core";

// Lengths are in viewport heights (1 = the canvas' height), times in seconds.

export type Range = readonly [min: number, max: number];
export type Vec3 = readonly [x: number, y: number, z: number];

/**
 * A hex color (`#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`), or `[offset, color]`
 * with `offset` in 0–1 along the particle's life.
 */
export type ColorStop = string | readonly [offset: number, color: string];

export type SizeOverLife = "constant" | "fadeIn" | "fadeOut" | "fadeInOut";

/** Procedural sprite shapes; a texture can be passed instead. */
export type SpriteShape = "soft" | "disc" | "ring" | "square" | "glint";

/**
 * `"additive"` adds light (glows, sparks); `"normal"` paints over what is
 * behind (snow, confetti).
 */
export type BlendMode = "additive" | "normal";

export type ParticlePresetName =
  | "dust"
  | "snow"
  | "sparkles"
  | "bubbles"
  | "fireflies"
  | "confetti";

export type EmitterOptions = {
  /**
   * Where particles spawn, as `[x0, y0, x1, y1]` in viewport UV (0–1, y up,
   * values outside 0–1 spawn off-screen). Defaults to the whole viewport.
   */
  area?: readonly [number, number, number, number];
  /**
   * Depth range, 0 nearest to 1 farthest. Farther particles look smaller,
   * dimmer and slower (see `perspective`). Defaults to `[0, 0]`.
   */
  depth?: Range;
};

export type CurlForce = {
  /** Acceleration scale. Uniform `curlStrength`. Defaults to 0.1. */
  strength?: number;
  /** Spatial frequency per viewport height. Uniform `curlScale`. Defaults to 1. */
  scale?: number;
  /** How fast the field evolves. Uniform `curlSpeed`. Defaults to 0.1. */
  speed?: number;
};

export type PointerForce = {
  /** Push away from the pointer; negative pulls in. Uniform `pointerStrength`. Defaults to 0.5. */
  strength?: number;
  /** Reach. Uniform `pointerRadius`. Defaults to 0.2. */
  radius?: number;
};

/**
 * The forces to simulate. Which ones are present is fixed at creation; their
 * values can change later through the uniforms named on each field.
 */
export type ForceOptions = {
  /** Constant acceleration. Uniform `gravity`. */
  gravity?: Vec3;
  /** Exponential velocity damping per second. Uniform `drag`. */
  drag?: number;
  /** Divergence-free swirl from `@frapx/glsl-noise` curl noise. */
  curl?: CurlForce;
  /** Push from the pointer. Has no effect under a manual clock. */
  pointer?: PointerForce;
};

/** What the particles look like and how they move. */
export type ParticleConfig = {
  /** Particles spawned per second. Uniform `rate`. */
  rate?: number;
  /** Lifetime range. Defaults to `[2, 4]`. */
  lifetime?: Range;
  emitter?: EmitterOptions;
  /** Initial velocity, uniformly random per axis between `min` and `max`. */
  velocity?: { min?: Vec3; max?: Vec3 };
  forces?: ForceOptions;
  /** Diameter range. Defaults to `[0.01, 0.02]`. */
  size?: Range;
  /** How the size changes over the particle's life. Defaults to `"constant"`. */
  sizeOverLife?: SizeOverLife;
  /** Color and alpha over the particle's life. Defaults to white. */
  color?: string | readonly ColorStop[];
  /** Colors picked at random per particle, multiplied with `color`. */
  palette?: readonly string[];
  /** Overall alpha. Uniform `opacity`. Defaults to 1. */
  opacity?: number;
  /** Defaults to `"soft"`. A texture is drawn with its own alpha. */
  sprite?: SpriteShape | TextureInput;
  /** Rotation speed range in radians per second. Defaults to `[0, 0]`. */
  spin?: Range;
  /** Flips the sprite around its vertical axis as it spins, like paper. */
  tumble?: boolean;
  /** Random brightness flicker, 0–1. Uniform `twinkle`. Defaults to 0. */
  twinkle?: number;
  /** Defaults to `"additive"`. */
  blend?: BlendMode;
  /**
   * How much depth shrinks particles: scale is `1 / (1 + depth * perspective)`.
   * Uniform `perspective`. Defaults to 1.5.
   */
  perspective?: number;
};

/**
 * Uniforms that `setUniform()` and `bindUniforms()` drive. The force ones only
 * exist when that force was configured.
 */
export type ParticleUniformName =
  | "rate"
  | "gravity"
  | "drag"
  | "curlStrength"
  | "curlScale"
  | "curlSpeed"
  | "pointerStrength"
  | "pointerRadius"
  | "opacity"
  | "twinkle"
  | "perspective";

export type CreateParticlesOptions = ParticleConfig & {
  target?: string | Element;
  canvas?: HTMLCanvasElement;
  /**
   * Starting point merged under the other options: a preset name or config.
   * `forces`, `emitter` and `velocity` merge field by field.
   */
  preset?: ParticlePresetName | ParticleConfig;
  /** Size of the particle pool. Defaults to `rate` times the longest lifetime, plus headroom. */
  maxParticles?: number;
  /** Simulation steps per second. Defaults to 60. Export at a frame rate that divides it. */
  simulationRate?: number;
  /**
   * Seconds simulated before time 0, so the first frame is already full.
   * Defaults to the longest lifetime; 0 starts empty.
   */
  prewarm?: number;
  /** Seed for every random choice. Defaults to 1. */
  seed?: number;
  /**
   * Storage the particles are drawn into. `"rgba16f"` keeps full precision for
   * `captureFrame({ format: "rgba16f" })` and 16-bit PNG export; it needs
   * `EXT_color_buffer_float`. Defaults to `"rgba8"`, drawing to the canvas.
   */
  format?: "rgba8" | "rgba16f";
  /**
   * When `"rgba16f"` is unsupported, `true` (default) warns and draws at
   * 8 bits; `false` fails with `UnsupportedError`.
   */
  formatFallback?: boolean;
  layer?: ShaderLayer;
  autoStart?: boolean;
  pauseWhenOffscreen?: boolean;
  pauseWhenHidden?: boolean;
  respectReducedMotion?: boolean;
  /** Defaults to `"realtime"`. See {@link ParticlesInstance.setTime}. */
  clock?: ClockMode;
  /** Realtime frames take their time from this source. See {@link ParticlesInstance.setTimeSource}. */
  timeSource?: TimeSource;
  /** Fixed internal render size. Required without `target` or `canvas`. */
  resolution?: Resolution;
  dpr?: DprOption;
  maxDpr?: number;
  autoResize?: boolean;
  debug?: boolean;
  canvasClass?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  onReady?: (instance: ParticlesInstance) => void;
  onError?: (error: Error) => void;
};

export type ParticlesInstance = {
  readonly canvas: HTMLCanvasElement | null;
  readonly gl: WebGL2RenderingContext | null;
  readonly status: ShaderStatus;
  readonly supported: boolean;
  readonly ready: Promise<void>;
  readonly clock: ClockMode;
  /**
   * The time of the last frame drawn, before any `accumulation.loop`
   * wrapping. Reads back where the picture is.
   */
  readonly time: number;
  /** Size of the particle pool. */
  readonly maxParticles: number;
  readonly simulationRate: number;
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
  /**
   * Moves the clock. The frame at time `t` shows the simulation after
   * `floor(t * simulationRate)` fixed steps from the prewarmed start. Going
   * back replays from the start; under a manual clock going forward runs every
   * step in between, so a frame is the same however it was reached. Does not
   * render by itself.
   */
  setTime(seconds: number): void;
  /** Switching to manual replays from the start on the next frame. */
  setClock(clock: ClockMode): void;
  /**
   * Makes the realtime clock follow an external transport, keeping the gates
   * and the pointer. A jump in the source is not a seek: going forward runs at
   * most 4 steps and drops the rest, going back restarts from the prewarmed
   * start. `setTime()` has no lasting effect while a source is set.
   */
  setTimeSource(source: TimeSource | null): void;
  setResolution(resolution: Resolution | null): void;
  /**
   * Draws the current frame and reads it back. `"png"` and `"rgba16f"` are
   * straight (not premultiplied) alpha; `"rgba8"` is the canvas as stored,
   * premultiplied. `"rgba16f"` needs `format: "rgba16f"`. Catching up to a far
   * time runs in batches that wait for the GPU in between.
   */
  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>>;
  /** Restarts the simulation from the prewarmed start on the next frame. */
  reset(): void;
  /**
   * Under a manual clock a value applies to the whole timeline: changing a
   * simulation uniform replays from the start, so frames stay reproducible.
   * Under a realtime clock it applies from the next step.
   */
  setUniform(name: ParticleUniformName, value: UniformInput): void;
  setUniforms(values: Partial<Record<ParticleUniformName, UniformInput>>): void;
  /**
   * Drives uniforms from `source`, such as `keyframes()`. Simulation uniforms
   * are evaluated at every step's time, so a timeline replays the same way
   * however frames are reached; the rest at the frame's time. Values override
   * `setUniform()`, and a later source wins over an earlier one. Under a
   * manual clock binding or removing replays from the start. Returns the
   * removal function.
   */
  bindUniforms(source: UniformSource): () => void;
  /** Replaces the color over life. */
  setColor(color: string | readonly ColorStop[]): void;
  /** Replaces the per-particle palette; `null` removes it. */
  setPalette(palette: readonly string[] | null): void;
  setBlend(blend: BlendMode): void;
};
