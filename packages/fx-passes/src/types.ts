import type {
  CaptureFormat,
  CaptureOptions,
  CaptureResult,
  ClockMode,
  DprOption,
  RenderMode,
  RenderTargetFormat,
  Resolution,
  ShaderCompileError,
  ShaderLayer,
  UniformSource,
  ShaderStatus,
  TextureInput,
  TextureMap,
  TimeSource,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue
} from "@frapx/core";

export type {
  CaptureFormat,
  CaptureOptions,
  CaptureResult,
  ClockMode,
  DprOption,
  RenderMode,
  RenderTargetFormat,
  Resolution,
  ShaderLayer,
  ShaderStatus,
  TextureInput,
  TextureMap,
  TimeSource,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue
} from "@frapx/core";

export type PassOptions = {
  /**
   * Identifier of the pass. Other passes sample its output as `u_<name>`, with
   * its size in `u_<name>Size`. Letters, digits and `_`, starting with a letter.
   */
  name: string;
  fragment: string;
  vertex?: string;
  /**
   * Passes this one samples. A pass listed earlier gives its output from this
   * frame; this pass itself or a later one gives its output from the previous
   * frame (that pass then keeps two buffers), like Shadertoy buffers.
   */
  inputs?: readonly string[];
  /**
   * Draws `accumulation.samples` samples of this pass per frame and passes
   * their mean on. Accumulating passes must come first, and may only read
   * passes listed after them, which gives their previous-frame output.
   */
  accumulate?: boolean;
  /** Storage of the output. Defaults to `"rgba16f"`. */
  format?: RenderTargetFormat;
  /** Output size relative to the canvas' internal size. Defaults to 1. */
  scale?: number;
  /** How readers sample the output. Defaults to `"linear"`. */
  filter?: "nearest" | "linear";
  /** Defaults to `"clamp"`. */
  wrap?: "clamp" | "repeat" | "mirror";
};

export type AccumulationOptions = {
  /** Samples per frame for accumulating passes. Defaults to 1. */
  samples?: number;
  /**
   * Open shutter as a fraction of the frame interval (0.5 is a 180° shutter).
   * Samples spread their `u_time` over `[time, time + shutter / fps)`.
   * Defaults to 0, no motion blur.
   */
  shutter?: number;
  /** Frame rate that sets the frame interval. Required when `shutter` > 0. */
  fps?: number;
  /**
   * Length in seconds of a seamless loop, or `null` (the default) for none.
   * Every pass then sees the time wrapped into `[0, loop)` — `u_frameTime`,
   * `u_time` and the time bound uniforms are evaluated at — with each
   * sample's shutter offset added in double precision before the upload, so
   * a frame one loop later is identical to the bit, with any sample count.
   */
  loop?: number | null;
};

export type ResolvedAccumulation = {
  readonly samples: number;
  readonly shutter: number;
  readonly fps: number | null;
  readonly loop: number | null;
};

export type SampleProgress = {
  /** Samples of the current frame drawn so far. */
  drawn: number;
  /** Samples the frame is complete at. */
  total: number;
  /** Whether the samples belong to a `captureFrame()`. */
  capturing: boolean;
};

/**
 * The instance's state at a size change, passed to `onResize`. The fields
 * match `@frapx/fx-canvas`' `RenderState`.
 */
export type PassesRenderState<
  TUniforms extends UniformInputMap = UniformInputMap,
> = {
  instance: PassesInstance<TUniforms>;
  gl: WebGL2RenderingContext;
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

export type CreatePassesOptions<
  TUniforms extends UniformInputMap = UniformInputMap,
> = {
  target?: string | Element;
  canvas?: HTMLCanvasElement;
  /** Drawn in order every frame; the last one is shown and captured. */
  passes: readonly PassOptions[];
  uniforms?: TUniforms;
  textures?: TextureMap;
  accumulation?: AccumulationOptions;
  layer?: ShaderLayer;
  autoStart?: boolean;
  pauseWhenOffscreen?: boolean;
  pauseWhenHidden?: boolean;
  respectReducedMotion?: boolean;
  renderMode?: RenderMode;
  /** Defaults to `"realtime"`. See `@frapx/fx-canvas`. */
  clock?: ClockMode;
  /** Realtime frames take their time from this source. See `@frapx/fx-canvas`. */
  timeSource?: TimeSource;
  /** Fixed internal render size. Required without `target` or `canvas`. */
  resolution?: Resolution;
  dpr?: DprOption;
  maxDpr?: number;
  autoResize?: boolean;
  debug?: boolean;
  canvasClass?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  onReady?: (instance: PassesInstance<TUniforms>) => void;
  onError?: (error: Error) => void;
  /** Called after every accumulated sample, in previews and captures. */
  onSample?: (progress: SampleProgress) => void;
  /**
   * Called whenever the render size actually changes (not every frame, nor on
   * setup), including after `setResolution()`; during `captureFrame()` it
   * waits until the capture ends. The pass buffers take the new size on the
   * next draw.
   */
  onResize?: (state: PassesRenderState<TUniforms>) => void;
};

export type PassesInstance<
  TUniforms extends UniformInputMap = UniformInputMap,
> = {
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
  readonly accumulation: ResolvedAccumulation;
  /** Samples of the current frame drawn so far. */
  readonly samplesDrawn: number;
  start(): void;
  stop(): void;
  /**
   * Draws the frame at the current time. Drawing the same time again refines
   * it with the next sample instead of advancing passes that read their
   * previous output.
   */
  render(): void;
  resize(): void;
  destroy(): void;
  /** See `@frapx/fx-canvas`. Does not render by itself. */
  setTime(seconds: number): void;
  setClock(clock: ClockMode): void;
  setTimeSource(source: TimeSource | null): void;
  setResolution(resolution: Resolution | null): void;
  /** Changes the accumulation settings and restarts the current frame's samples. */
  setAccumulation(options: AccumulationOptions): void;
  /**
   * Draws every sample of the frame at the current time from scratch, runs
   * the remaining passes once and reads the last pass back. Waits for the GPU
   * between samples. `"rgba16f"` reads the last pass' float output; `"png"`
   * and `"rgba8"` read the canvas. Uniform, accumulation and feedback changes
   * made while it draws apply to the next frame; a texture replaced meanwhile
   * takes effect as soon as it loads.
   */
  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>>;
  /** Clears the previous-frame outputs, so the next frame starts from empty history. */
  resetFeedback(): void;
  /**
   * Swaps the fragment shader of pass `name` in place. The pass keeps its
   * buffers, format and inputs (change those by creating a new instance), and
   * the time, uniforms and textures carry over; the frame's samples start over.
   * On a compile error it returns a `ShaderCompileError` (also passed to
   * `onError`) and keeps drawing with the previous shader. During
   * `captureFrame()` the new shader is compiled at once and used from the next
   * frame. Throws `RangeError` for an unknown pass.
   */
  setFragment(name: string, fragment: string): ShaderCompileError | null;
  /**
   * Drives uniforms from `source`, such as `keyframes()`. In accumulating
   * passes `source.get()` runs for every sample at the sample's time within
   * the shutter, so values it animates get motion blur like `u_time`; later
   * passes see the frame's time. Values override `setUniform()` for the same
   * names, and a later source wins over an earlier one. A source that returns
   * different values for the same time (an edited timeline) restarts the
   * frame's samples on the next `render()`. Binding or removing during
   * `captureFrame()` applies from the next frame. Returns the removal function.
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
