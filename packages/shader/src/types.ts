export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

export type ShaderLayer = "background" | "overlay";
export type RenderMode = "always" | "demand";
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

export type DprOption = "auto" | number | (() => number);

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

export type TextureSource = string | HTMLImageElement | HTMLCanvasElement;

export type TextureOptions = {
  source: TextureSource;
  wrap?: "clamp" | "repeat" | "mirror";
  filter?: "nearest" | "linear";
  flipY?: boolean;
};

export type TextureInput = TextureSource | TextureOptions;
export type TextureMap = Record<string, TextureInput>;

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
};

export type ShaderBackgroundInstance<
  TUniforms extends UniformInputMap = UniformInputMap,
> = {
  readonly canvas: HTMLCanvasElement | null;
  readonly gl: GLContext | null;
  readonly status: ShaderStatus;
  readonly supported: boolean;
  readonly ready: Promise<void>;
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
  setTexture(name: string, input: TextureInput): Promise<void>;
  setTextures(values: TextureMap): Promise<void>;
  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>,
  ): void;
  setUniform(name: string, value: UniformInput): void;
  setUniforms(values: Record<string, UniformInput>): void;
};
