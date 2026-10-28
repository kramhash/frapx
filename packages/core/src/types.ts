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

export type UniformScalar = number;
export type UniformVec2 = [number, number] | readonly [number, number];
export type UniformVec3 =
  | [number, number, number]
  | readonly [number, number, number];
export type UniformVec4 =
  | [number, number, number, number]
  | readonly [number, number, number, number];

export type UniformType = "float" | "vec2" | "vec3" | "vec4" | "mat3" | "mat4";

export type ExplicitUniformInput = {
  type: UniformType;
  value: number[] | Float32Array;
};

export type UniformInput =
  | UniformScalar
  | UniformVec2
  | UniformVec3
  | UniformVec4
  | Float32Array
  | ExplicitUniformInput;

export type UniformInputMap = Record<string, UniformInput>;

export type UniformRuntimeValue<T> = T extends ExplicitUniformInput
  ? ExplicitUniformInput
  : T extends Float32Array
    ? Float32Array
    : T extends readonly [number, number]
      ? UniformVec2
      : T extends readonly [number, number, number]
        ? UniformVec3
        : T extends readonly [number, number, number, number]
          ? UniformVec4
          : T extends number
            ? number
            : UniformInput;

/**
 * Storage format of a render target. `rgba16f` (half float) and `rgba32f`
 * (float) need WebGL2 with `EXT_color_buffer_float`. `rgba32f` is sampled with
 * nearest filtering unless `OES_texture_float_linear` is available.
 */
export type RenderTargetFormat = "rgba8" | "rgba16f" | "rgba32f";

export type RenderTargetOptions = {
  /** Defaults to `"rgba8"`. */
  format?: RenderTargetFormat;
  /**
   * When the requested format is unsupported, `true` (default) warns and
   * allocates `rgba8` instead; `false` throws `UnsupportedError`.
   */
  formatFallback?: boolean;
  filter?: "nearest" | "linear";
  wrap?: "clamp" | "repeat" | "mirror";
  /** Color the storage is cleared to on creation, resize and `clear()`. */
  clearColor?: readonly [number, number, number, number];
};

export type RenderTarget = {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
  /** The format actually allocated, after any fallback. */
  readonly format: RenderTargetFormat;
  /** Reallocates (and clears) the storage when the size changes. */
  resize(width: number, height: number): void;
  /** Clears the storage to `clearColor`. Leaves the default framebuffer bound. */
  clear(): void;
  dispose(): void;
};

export type PingPong = {
  /** The target holding the last completed frame. */
  readonly read: RenderTarget;
  /** The target to draw the next frame into. */
  readonly write: RenderTarget;
  /** The format actually allocated, after any fallback. */
  readonly format: RenderTargetFormat;
  /** Exchanges `read` and `write`; call after drawing into `write`. */
  swap(): void;
  resize(width: number, height: number): void;
  clear(): void;
  dispose(): void;
};

/**
 * `"png"` resolves to a `Blob`, `"rgba8"` to a `Uint8Array` and `"rgba16f"` to
 * a `Float32Array`. Raw formats are RGBA, top row first.
 */
export type CaptureFormat = "png" | "rgba8" | "rgba16f";

export type CaptureOptions<F extends CaptureFormat = CaptureFormat> = {
  /** Defaults to `"png"`. */
  format?: F;
  /**
   * Rejects the capture with the signal's reason when aborted before drawing,
   * or between the steps of a capture that draws over several tasks.
   */
  signal?: AbortSignal;
};

export type CaptureResult<F extends CaptureFormat> = F extends "rgba16f"
  ? Float32Array
  : F extends "rgba8"
    ? Uint8Array
    : Blob;

export type HostPointer = {
  x: number;
  y: number;
  uvX: number;
  uvY: number;
  active: number;
};

export type HostFrameState = {
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
  reducedMotion: boolean;
  pointer: HostPointer;
};

export type SetupCanvasOptions = {
  target?: string | Element;
  canvas?: HTMLCanvasElement;
  layer?: ShaderLayer;
  canvasClass?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  /**
   * When neither `target` nor `canvas` is given, create a canvas that is not
   * attached to the document instead of failing.
   */
  detached?: boolean;
};

export type RuntimeHostOptions = {
  target?: string | Element;
  canvas?: HTMLCanvasElement;
  layer?: ShaderLayer;
  dpr?: DprOption;
  maxDpr?: number;
  autoResize?: boolean;
  canvasClass?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  autoStart?: boolean;
  pauseWhenOffscreen?: boolean;
  pauseWhenHidden?: boolean;
  respectReducedMotion?: boolean;
  renderMode?: RenderMode;
  /** Defaults to `"realtime"`. See {@link ClockMode}. */
  clock?: ClockMode;
  /** Takes realtime loop frames' time from this source; unread in demand mode. See {@link TimeSource}. */
  timeSource?: TimeSource;
  /**
   * Fixes the internal render size instead of following the target's size.
   * Required when neither `target` nor `canvas` is given.
   */
  resolution?: Resolution;
  debug?: boolean;

  createContext: (canvas: HTMLCanvasElement) => GLContext | null;
  onInit: (gl: GLContext, width: number, height: number) => Promise<void> | void;
  onDraw: (state: HostFrameState) => void;
  /** Called whenever the observed size actually changes (not every frame). */
  onResize?: (state: HostFrameState) => void;
  /**
   * Returns the render target that holds the last drawn frame at full
   * precision, if any. `captureFrame({ format: "rgba16f" })` reads from it.
   */
  captureSource?: () => RenderTarget | null;
  /**
   * Draws the frame `captureFrame()` reads, in place of `onDraw`, when drawing
   * it takes more than one task (such as accumulating samples while waiting
   * for the GPU). The host holds its render lock until the promise settles and
   * reads the result in the task that settled it, so the final draw into the
   * canvas must happen in that task. Receives the capture's abort signal.
   */
  onCaptureDraw?: (
    state: HostFrameState,
    signal: AbortSignal | undefined
  ) => Promise<void>;
  onContextLost?: () => void;
  onContextRestored?: (
    gl: GLContext,
    width: number,
    height: number
  ) => Promise<void> | void;

  onReady?: () => void;
  onError?: (error: Error) => void;
};

export type RuntimeHostInstance = {
  readonly canvas: HTMLCanvasElement | null;
  readonly gl: GLContext | null;
  readonly status: ShaderStatus;
  readonly supported: boolean;
  readonly ready: Promise<void>;
  readonly clock: ClockMode;
  /**
   * The time of the last frame drawn, before any `accumulation.loop`
   * wrapping. Use it to read back where the picture is, for example to
   * start audio at the same position or to render a frame counter.
   */
  readonly time: number;
  readonly timeSource: TimeSource | null;
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
  /**
   * Sets the clock to `seconds`. In manual mode `u_delta` becomes the
   * difference from the previous `setTime()` value (0 the first time). In
   * realtime mode this seeks the running clock. Does not render by itself.
   */
  setTime(seconds: number): void;
  /** Switches between realtime and manual clocks after creation. */
  setClock(clock: ClockMode): void;
  /**
   * Sets or removes the realtime clock's external time source. Each realtime
   * frame then takes `time = source()` and `delta` from the previous frame's
   * value, clamped to `[0, 0.1]`. A manual clock ignores the source but keeps it.
   */
  setTimeSource(source: TimeSource | null): void;
  /**
   * Fixes the internal render size, or follows the target's size again when
   * `null`. Throws `UnsupportedError` when the size exceeds the GPU limits.
   */
  setResolution(resolution: Resolution | null): void;
  /**
   * Draws a frame and reads it back in the same task, so it does not depend on
   * `preserveDrawingBuffer`. Draws even while paused or hidden; waits for
   * `ready` first. `"rgba16f"` needs a float `captureSource`.
   */
  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>>;
};
