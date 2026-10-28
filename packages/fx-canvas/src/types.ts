import type {
  ShaderCompileError,
  UniformSource,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue,
  UniformVec4
} from "@frapx/core";

export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

export type ShaderLayer = "background" | "overlay";
export type RenderMode = "always" | "demand";
/**
 * `"realtime"` advances time from requestAnimationFrame. `"manual"` never
 * renders on its own: time only changes through `setTime()` and frames are
 * drawn only by explicit `render()` calls, so output is deterministic.
 */
export type ClockMode = "realtime" | "manual";
/**
 * Returns the current time in seconds from an external transport, such as an
 * audio player's position. Under the realtime clock it replaces
 * requestAnimationFrame time while the gates keep working.
 */
export type TimeSource = () => number;
/** Fixed internal render size in pixels: `[width, height]`. */
export type Resolution = readonly [number, number];
export type DprOption = "auto" | number | (() => number);

export type ShaderStatus =
  | "idle"
  | "loading"
  | "ready"
  | "running"
  | "paused"
  | "error"
  | "unsupported"
  | "context-lost"
  | "destroyed";

export type TextureSource = string | HTMLImageElement | HTMLCanvasElement;

export type TextureOptions = {
  source: TextureSource;
  wrap?: "clamp" | "repeat" | "mirror";
  filter?: "nearest" | "linear";
  flipY?: boolean;
};

export type TextureInput = TextureSource | TextureOptions;
export type TextureMap = Record<string, TextureInput>;

export type {
  ExplicitUniformInput,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue,
  UniformScalar,
  UniformType,
  UniformVec2,
  UniformVec3,
  UniformVec4
} from "@frapx/core";

/**
 * Storage format of the feedback buffers. `rgba16f` (half float) keeps values
 * outside 0–1 and fine increments that 8-bit storage would round away; it needs
 * WebGL2 with `EXT_color_buffer_float`.
 */
export type FeedbackFormat = "rgba8" | "rgba16f";

/**
 * `"png"` resolves to a `Blob`, `"rgba8"` to a `Uint8Array` and `"rgba16f"` to
 * a `Float32Array`. Raw formats are RGBA, top row first.
 */
export type CaptureFormat = "png" | "rgba8" | "rgba16f";

export type CaptureOptions<F extends CaptureFormat = CaptureFormat> = {
  /** Defaults to `"png"`. */
  format?: F;
  /** Rejects the capture with the signal's reason when already aborted. */
  signal?: AbortSignal;
};

export type CaptureResult<F extends CaptureFormat> = F extends "rgba16f"
  ? Float32Array
  : F extends "rgba8"
    ? Uint8Array
    : Blob;

export type FeedbackOptions = {
  /**
   * Suffix name for the generated sampler uniform. Defaults to
   * "previousFrame", which creates `u_previousFrame` and
   * `u_previousFrameSize`.
   */
  uniform?: string;
  filter?: "nearest" | "linear";
  wrap?: "clamp" | "repeat" | "mirror";
  clearColor?: UniformVec4;
  /**
   * Defaults to `"rgba8"`. `"rgba16f"` requests a WebGL2 context even for
   * GLSL ES 1.00 shaders and falls back to WebGL1 when unavailable.
   */
  format?: FeedbackFormat;
  /**
   * When `format` is unsupported, `true` (default) warns and uses `"rgba8"`;
   * `false` fails initialization with `UnsupportedError`. Read the allocated
   * format from `instance.feedbackFormat`.
   */
  formatFallback?: boolean;
};

export type RenderState<TUniforms extends UniformInputMap = UniformInputMap> = {
  instance: ShaderBackgroundInstance<TUniforms>;
  gl: GLContext;
  canvas: HTMLCanvasElement;
  time: number;
  delta: number;
  frame: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  /** Whether the OS "prefers reduced motion" setting is currently enabled. */
  reducedMotion: boolean;
};

export type CreateShaderBackgroundOptions<
  TUniforms extends UniformInputMap = UniformInputMap,
> = {
  target?: string | Element;
  canvas?: HTMLCanvasElement;
  fragment: string;
  vertex?: string;
  uniforms?: TUniforms;
  textures?: TextureMap;
  feedback?: boolean | FeedbackOptions;
  layer?: ShaderLayer;
  autoStart?: boolean;
  pauseWhenOffscreen?: boolean;
  /**
   * Pause the render loop while the document is hidden (e.g. a background tab).
   * Defaults to `true`.
   */
  pauseWhenHidden?: boolean;
  /**
   * When `true`, automatically hold a single static frame while the user's OS
   * "prefers reduced motion" setting is enabled. Defaults to `false`. The
   * `u_reducedMotion` uniform (0/1) is always supplied regardless of this flag.
   */
  respectReducedMotion?: boolean;
  renderMode?: RenderMode;
  /**
   * Defaults to `"realtime"`. With `"manual"`, no animation loop runs: set the
   * time with `setTime()` and draw with `render()`. Offscreen, hidden and
   * reduced-motion pausing are bypassed, and `u_pointer*` / `u_reducedMotion`
   * stay at 0 so the same time and uniforms always produce the same pixels.
   * Switch later with `setClock()`.
   */
  clock?: ClockMode;
  /**
   * Makes the realtime animation loop follow an external transport, such as an
   * audio player: every frame takes `u_time = timeSource()` and `u_delta` from
   * the previous frame's value, clamped to `[0, 0.1]` (0 when the source goes
   * back, and on the first frame after a pause). Offscreen, hidden and
   * reduced-motion pausing keep working, and so does the pointer; the
   * reduced-motion frame is drawn at the source's time. `render()` and
   * `captureFrame()` redraw at the last frame's time. A manual clock ignores
   * the source but keeps it, and `renderMode: "demand"`, which runs no frame
   * loop, never reads it. Change later with `setTimeSource()`.
   */
  timeSource?: TimeSource;
  /**
   * Fixes the internal render size (`u_resolution`) instead of following the
   * target's size. The canvas is letterboxed with `object-fit: contain`,
   * `u_viewportSize` stays the displayed size and `u_pixelRatio` is derived
   * from the two; `dpr` and `maxDpr` are ignored. Required when neither
   * `target` nor `canvas` is given, in which case a detached canvas is created.
   * Change later with `setResolution()`.
   */
  resolution?: Resolution;
  dpr?: DprOption;
  maxDpr?: number;
  autoResize?: boolean;
  debug?: boolean;
  canvasClass?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  onReady?: (instance: ShaderBackgroundInstance<TUniforms>) => void;
  onError?: (error: Error) => void;
  onBeforeRender?: (state: RenderState<TUniforms>) => void;
  onAfterRender?: (state: RenderState<TUniforms>) => void;
  /** Called whenever the observed size actually changes (not every frame). */
  onResize?: (state: RenderState<TUniforms>) => void;
};

export type ShaderBackgroundInstance<
  TUniforms extends UniformInputMap = UniformInputMap,
> = {
  readonly canvas: HTMLCanvasElement | null;
  readonly gl: GLContext | null;
  readonly status: ShaderStatus;
  readonly supported: boolean;
  readonly ready: Promise<void>;
  /** The active clock mode. */
  readonly clock: ClockMode;
  /**
   * The time of the last frame drawn, before any `accumulation.loop`
   * wrapping. Reads back where the picture is.
   */
  readonly time: number;
  /**
   * The feedback format actually allocated (after any fallback), or `null`
   * without feedback or before initialization.
   */
  readonly feedbackFormat: FeedbackFormat | null;
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
  /**
   * Sets `u_time` to `seconds`. In manual mode `u_delta` becomes the difference
   * from the previous `setTime()` value (0 the first time, not clamped). In
   * realtime mode this seeks the running clock. Does not render by itself.
   */
  setTime(seconds: number): void;
  /**
   * Switches between `"realtime"` and `"manual"` clocks. Returning to realtime
   * resumes the loop if the instance was started.
   */
  setClock(clock: ClockMode): void;
  /**
   * Sets or removes the realtime clock's time source. Removing it continues
   * from the source's last time.
   */
  setTimeSource(source: TimeSource | null): void;
  /**
   * Fixes the internal render size, or follows the target's size again when
   * `null`. Resets the feedback buffers like any resize. Throws
   * `UnsupportedError` when the size exceeds the GPU's limits, and `TypeError`
   * when passing `null` to an instance created without a target.
   */
  setResolution(resolution: Resolution | null): void;
  /**
   * Draws a frame and reads it back in the same task, so it does not depend on
   * `preserveDrawingBuffer`. Like `render()` it advances feedback, but it draws
   * even while paused, offscreen or hidden. Waits for `ready` first.
   * `"rgba16f"` reads the float feedback buffer and rejects with
   * `UnsupportedError` unless `feedbackFormat` is `"rgba16f"`.
   */
  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>>;
  /**
   * Clears both feedback buffers to `clearColor`, so the next frame starts
   * from an empty history. Re-renders in demand mode; otherwise does not draw.
   */
  resetFeedback(): void;
  /**
   * Swaps the fragment shader in place, keeping the time, uniforms, textures
   * and feedback history (call `resetFeedback()` to clear it). On a compile
   * error it returns a `ShaderCompileError` (also passed to `onError`) and keeps
   * drawing with the previous shader; it never throws for one. Returns an error
   * too for an instance whose first shader failed (create a new one) and for a
   * GLSL ES 3.00 shader on a WebGL1 context. Re-renders in demand mode;
   * otherwise the next frame shows it.
   */
  setFragment(fragment: string): ShaderCompileError | null;
  /**
   * Drives uniforms from `source`, such as `keyframes()` or a timeline
   * library adapter. `source.get(time)` runs before every draw with the same
   * time as `u_time` (the `setTime()` value under a manual clock), and its
   * values override `setUniform()` for the same names; a later source wins
   * over an earlier one. Returns a function that removes the binding.
   */
  bindUniforms(source: UniformSource): () => void;
  setTexture(name: string, input: TextureInput): Promise<void>;
  setTextures(values: TextureMap): Promise<void>;
  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>,
  ): void;
  setUniform(name: string, value: UniformInput): void;
  setUniforms(values: Record<string, UniformInput>): void;
};
