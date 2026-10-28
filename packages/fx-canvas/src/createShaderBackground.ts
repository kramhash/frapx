import type {
  CaptureFormat,
  CaptureOptions,
  CaptureResult,
  ClockMode,
  CreateShaderBackgroundOptions,
  FeedbackFormat,
  GLContext,
  RenderState,
  ShaderBackgroundInstance,
  Resolution,
  ShaderStatus,
  TextureInput,
  TextureMap,
  TimeSource,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue
} from "./types";
import {
  ShaderCompileError,
  TextureLoadError,
  UnsupportedError,
  applyProgramUniform,
  applyUniforms,
  createFullscreenProgram,
  createRuntimeHost,
  createTextureSet,
  createUniformBindings,
  createUniformCache,
  isGLSL300,
  isWebGL2Context,
  normalizeUniform,
  toUniformName
} from "@frapx/core";
import type {
  FullscreenProgram,
  HostFrameState,
  LoadedTexture,
  NormalizedUniform,
  RuntimeHostInstance,
  TextureSet,
  UniformBindings,
  UniformSource
} from "@frapx/core";
import {
  bindFeedbackForRead,
  copyFeedbackToCanvas,
  createFeedbackState,
  deleteFeedbackState,
  normalizeFeedbackOptions,
  resizeFeedbackState,
  swapFeedbackTargets,
  type FeedbackState,
  type NormalizedFeedbackOptions
} from "./internal/feedback";

export const createShaderBackground = <
  TUniforms extends UniformInputMap = UniformInputMap
>(
  options: CreateShaderBackgroundOptions<TUniforms>
): ShaderBackgroundInstance<TUniforms> => {
  return new ShaderBackground<TUniforms>(options);
};

const wantsFloatFeedback = (
  feedback: CreateShaderBackgroundOptions["feedback"]
): boolean => typeof feedback === "object" && feedback.format === "rgba16f";

class ShaderBackground<TUniforms extends UniformInputMap>
  implements ShaderBackgroundInstance<TUniforms>
{
  readonly ready: Promise<void>;

  private readonly options: CreateShaderBackgroundOptions<TUniforms>;
  private readonly uniformCache: Map<string, NormalizedUniform>;
  private readonly bindings: UniformBindings = createUniformBindings();
  private readonly warnedUniforms = new Set<string>();
  private readonly host: RuntimeHostInstance;

  // Shader-specific GL state
  private _gl: GLContext | null = null;
  private shaderProgram: FullscreenProgram | null = null;
  private textureSet: TextureSet;
  private feedbackOptions: NormalizedFeedbackOptions | null = null;
  private feedbackState: FeedbackState | null = null;
  private shaderDestroyed = false;
  // The current fragment source; setFragment() replaces it, and a restored
  // context compiles it again.
  private fragment: string;
  // The last source that compiled, to fall back on when a source swapped in
  // while the context was lost fails once it is restored.
  private lastGoodFragment: string | null = null;

  constructor(options: CreateShaderBackgroundOptions<TUniforms>) {
    this.options = options;
    this.fragment = options.fragment;
    this.uniformCache = createUniformCache(options.uniforms);
    this.textureSet = createTextureSet(options.textures);

    this.host = createRuntimeHost({
      ...(options.target !== undefined && { target: options.target }),
      ...(options.canvas !== undefined && { canvas: options.canvas }),
      ...(options.layer !== undefined && { layer: options.layer }),
      ...(options.dpr !== undefined && { dpr: options.dpr }),
      ...(options.maxDpr !== undefined && { maxDpr: options.maxDpr }),
      ...(options.autoResize !== undefined && { autoResize: options.autoResize }),
      ...(options.canvasClass !== undefined && { canvasClass: options.canvasClass }),
      ...(options.canvasStyle !== undefined && { canvasStyle: options.canvasStyle }),
      ...(options.autoStart !== undefined && { autoStart: options.autoStart }),
      ...(options.pauseWhenOffscreen !== undefined && { pauseWhenOffscreen: options.pauseWhenOffscreen }),
      ...(options.pauseWhenHidden !== undefined && { pauseWhenHidden: options.pauseWhenHidden }),
      ...(options.respectReducedMotion !== undefined && { respectReducedMotion: options.respectReducedMotion }),
      ...(options.renderMode !== undefined && { renderMode: options.renderMode }),
      ...(options.clock !== undefined && { clock: options.clock }),
      ...(options.timeSource !== undefined && { timeSource: options.timeSource }),
      ...(options.resolution !== undefined && { resolution: options.resolution }),
      ...(options.debug !== undefined && { debug: options.debug }),

      createContext: (canvas) => {
        // A restored context keeps its first kind: asking a WebGL2 canvas for
        // "webgl" returns null, and GLSL ES 1.00 swapped in runs on WebGL2.
        const want300 = this._gl ? isWebGL2Context(this._gl) : isGLSL300(this.fragment);
        const attrs = {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false
        };
        if (want300 || wantsFloatFeedback(options.feedback)) {
          // WebGL2 also accepts GLSL ES 1.00, so float feedback can upgrade
          // the context without changing the shader.
          const gl2 = canvas.getContext("webgl2", attrs) as GLContext | null;
          if (gl2) return gl2;
          if (want300) {
            throw new UnsupportedError("WebGL2 is not supported in this browser.");
          }
        }
        return canvas.getContext("webgl", attrs) as GLContext | null;
      },

      onInit: async (gl, width, height) => {
        this._gl = gl;
        if (this.host.canvas) {
          this.host.canvas.dataset.frapxShaderCanvas = "";
        }
        this.feedbackOptions = normalizeFeedbackOptions(options.feedback);
        this.initProgram(gl);
        this.assertNoFeedbackTextureConflict();
        this.initFeedback(gl, width, height);
        await this.loadTextureInputs(gl);
        this.applyTextureSizeUniforms();
      },

      onDraw: (state) => {
        if (this.shaderDestroyed || !this.shaderProgram) return;
        this.drawFrame(state);
      },

      onResize: (state) => {
        if (this.shaderDestroyed) return;
        this.options.onResize?.(this.createRenderState(state));
      },

      captureSource: () => this.feedbackState?.targets.read ?? null,

      onContextLost: () => {
        this.feedbackState = null;
      },

      onContextRestored: async (gl, width, height) => {
        this._gl = gl;
        this.initProgram(gl);
        this.applyCachedUniforms(gl);
        this.initFeedback(gl, width, height);
        await this.loadTextureInputs(gl);
        this.applyTextureSizeUniforms();
      },

      onReady: () => options.onReady?.(this),
      ...(options.onError !== undefined && { onError: options.onError })
    });

    this.ready = this.host.ready;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.host.canvas;
  }

  get gl(): GLContext | null {
    return this.host.gl;
  }

  get status(): ShaderStatus {
    return this.host.status;
  }

  get supported(): boolean {
    return this.host.supported;
  }

  get clock(): ClockMode {
    return this.host.clock;
  }

  get time(): number {
    return this.host.time;
  }

  get feedbackFormat(): FeedbackFormat | null {
    // Feedback only ever requests rgba8 or rgba16f, and falls back to rgba8.
    return (this.feedbackState?.targets.format as FeedbackFormat | undefined) ?? null;
  }

  start(): void {
    this.host.start();
  }

  stop(): void {
    this.host.stop();
  }

  render(): void {
    this.host.render();
  }

  resize(): void {
    this.host.resize();
  }

  setTime(seconds: number): void {
    if (this.shaderDestroyed) return;
    this.host.setTime(seconds);
  }

  setClock(clock: ClockMode): void {
    if (this.shaderDestroyed) return;
    this.host.setClock(clock);
  }

  setTimeSource(source: TimeSource | null): void {
    if (this.shaderDestroyed) return;
    this.host.setTimeSource(source);
  }

  setResolution(resolution: Resolution | null): void {
    if (this.shaderDestroyed) return;
    this.host.setResolution(resolution);
  }

  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>> {
    return this.host.captureFrame(options);
  }

  resetFeedback(): void {
    if (this.shaderDestroyed || !this.feedbackState) return;
    this.feedbackState.targets.clear();
    if (this.shouldRenderOnDemand) {
      this.host.render();
    }
  }

  setFragment(fragment: string): ShaderCompileError | null {
    if (this.shaderDestroyed) return null;
    if (this.host.status === "error") {
      return new ShaderCompileError(
        "This instance failed to start, so it cannot swap shaders. Create a new one."
      );
    }
    const gl = this._gl;
    // Before initialization or while the context is lost, the new source is
    // compiled when the program is (re)built; a restore that fails to compile
    // it reports the error and falls back to the last working source.
    if (!gl || !this.shaderProgram || gl.isContextLost()) {
      this.fragment = fragment;
      return null;
    }
    if (isGLSL300(fragment) && !isWebGL2Context(gl)) {
      return this.reportSwapError(
        new ShaderCompileError(
          "A GLSL ES 3.00 shader needs WebGL2, but this instance runs on WebGL1 because its first shader was GLSL ES 1.00. Create a new instance.",
          { stage: "fragment" }
        )
      );
    }

    let program: FullscreenProgram;
    try {
      program = createFullscreenProgram(gl, fragment, this.options.vertex);
    } catch (error) {
      return this.reportSwapError(
        error instanceof ShaderCompileError
          ? error
          : new ShaderCompileError(error instanceof Error ? error.message : String(error))
      );
    }
    // Built before the old one is released, so a failure never leaves the
    // instance without a program. Uniforms, textures and feedback are bound
    // again on every draw, so they carry over.
    this.shaderProgram.dispose();
    this.shaderProgram = program;
    this.fragment = fragment;
    this.lastGoodFragment = fragment;
    this.warnedUniforms.clear();
    if (this.shouldRenderOnDemand) {
      this.host.render();
    }
    return null;
  }

  bindUniforms(source: UniformSource): () => void {
    const remove = this.bindings.add(source);
    if (this.shouldRenderOnDemand) this.host.render();
    return () => {
      remove();
      if (this.shouldRenderOnDemand && !this.shaderDestroyed) this.host.render();
    };
  }

  // Bound sources are evaluated at the frame's time and override setUniform()
  // values for the same names.
  private applyBoundUniforms(gl: GLContext, time: number): void {
    if (this.bindings.size === 0 || !this.shaderProgram) return;
    applyUniforms(gl, this.shaderProgram.locations, this.bindings.evaluate(time), (name) =>
      this.warnUnknownUniform(name)
    );
  }

  private reportSwapError(error: ShaderCompileError): ShaderCompileError {
    this.options.onError?.(error);
    return error;
  }

  destroy(): void {
    if (this.shaderDestroyed) return;
    this.shaderDestroyed = true;

    const gl = this._gl;
    if (gl) {
      this.textureSet.dispose(gl);
      deleteFeedbackState(this.feedbackState);
      this.feedbackState = null;
      this.shaderProgram?.dispose();
    }

    this.host.destroy();
  }

  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>
  ): void;
  setUniform(name: string, value: UniformInput): void;
  setUniform(name: string, value: UniformInput): void {
    if (this.shaderDestroyed) return;
    const uniformName = toUniformName(name);
    this.uniformCache.set(uniformName, normalizeUniform(value));

    const gl = this._gl;
    const program = this.shaderProgram;
    const location = program?.locations.get(uniformName);
    if (gl && program && location) {
      applyProgramUniform(
        gl,
        program.program,
        location,
        this.uniformCache.get(uniformName)!
      );
    } else if (program) {
      this.warnUnknownUniform(uniformName);
    }

    if (this.shouldRenderOnDemand) {
      this.host.render();
    }
  }

  setUniforms(values: Record<string, UniformInput>): void {
    for (const [name, value] of Object.entries(values)) {
      this.setUniform(name, value);
    }
  }

  async setTexture(name: string, input: TextureInput): Promise<void> {
    if (this.shaderDestroyed) return;
    if (this.feedbackOptions?.uniform === name) {
      const error = new TextureLoadError(
        `Texture name conflicts with feedback uniform: ${name}`
      );
      this.options.onError?.(error);
      throw error;
    }

    let gl = this._gl;
    if (!gl) {
      await this.ready;
      if (this.shaderDestroyed) return;
      gl = this._gl;
    }

    if (!gl) {
      const error = new TextureLoadError(
        "Cannot set texture before WebGL is ready."
      );
      this.options.onError?.(error);
      throw error;
    }

    try {
      const loaded = await this.textureSet.set(
        gl,
        name,
        input,
        () => this.shaderDestroyed
      );
      if (!loaded) return;
      this.applyTextureSizeUniform(loaded);

      if (this.shouldRenderOnDemand) {
        this.host.render();
      }
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(normalized);
      throw normalized;
    }
  }

  async setTextures(values: TextureMap): Promise<void> {
    await Promise.all(
      Object.entries(values).map(([name, input]) =>
        this.setTexture(name, input)
      )
    );
  }

  private drawFrame(state: HostFrameState): void {
    const gl = state.gl;

    this.uniformCache.set("u_time", { type: "float", value: [state.time] });
    this.uniformCache.set("u_delta", { type: "float", value: [state.delta] });

    this.resizeFeedback(state.width, state.height);
    this.bindDrawTarget(gl, state.width, state.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.shaderProgram!.program);
    this.applyBuiltInUniforms(gl, state);

    const renderState = this.createRenderState(state);
    this.options.onBeforeRender?.(renderState);
    // Re-establish core draw state after user hook so GL side-effects
    // (framebuffer, viewport, program, buffer, attribs, textures) cannot
    // corrupt the core draw. resetFeedback() from the hook unbinds the FBO.
    this.bindDrawTarget(gl, state.width, state.height);
    this.prepareDrawState(gl);
    this.applyBoundUniforms(gl, state.time);

    this.shaderProgram!.draw();
    this.options.onAfterRender?.(renderState);

    if (this.feedbackState) {
      copyFeedbackToCanvas(this.feedbackState, state.width, state.height);
      swapFeedbackTargets(this.feedbackState);
    }
  }

  // Demand mode re-renders on input changes, except under a manual clock where
  // only explicit render() calls draw.
  private get shouldRenderOnDemand(): boolean {
    return (
      this.options.renderMode === "demand" &&
      this.host.clock !== "manual" &&
      !this.shaderDestroyed
    );
  }

  private initProgram(gl: GLContext): void {
    this.shaderProgram?.dispose();
    this.shaderProgram = null;
    deleteFeedbackState(this.feedbackState);
    this.feedbackState = null;

    try {
      this.shaderProgram = createFullscreenProgram(gl, this.fragment, this.options.vertex);
    } catch (error) {
      const fallback = this.lastGoodFragment;
      if (fallback === null || fallback === this.fragment || !(error instanceof ShaderCompileError)) {
        throw error;
      }
      this.options.onError?.(error);
      this.fragment = fallback;
      this.shaderProgram = createFullscreenProgram(gl, fallback, this.options.vertex);
    }
    this.lastGoodFragment = this.fragment;
  }

  private bindDrawTarget(gl: GLContext, width: number, height: number): void {
    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      this.feedbackState ? this.feedbackState.targets.write.framebuffer : null
    );
    gl.viewport(0, 0, width, height);
  }

  // Re-bind core program, geometry, textures and uniforms so a draw is correct
  // regardless of GL state changed by onBeforeRender/onAfterRender.
  private prepareDrawState(gl: GLContext): void {
    if (!this.shaderProgram) return;
    this.shaderProgram.use();
    this.textureSet.bind(gl, this.shaderProgram.locations, (name) =>
      this.warnUnknownUniform(name)
    );
    this.applyCachedUniforms(gl);
    this.applyFeedbackTexture(gl);
  }

  private initFeedback(gl: GLContext, width: number, height: number): void {
    if (!this.feedbackOptions) return;
    const unit = this.textureSet.reserveUnit(gl, this.feedbackOptions.uniform);
    this.feedbackState = createFeedbackState(
      gl,
      this.feedbackOptions,
      width,
      height,
      unit
    );
    this.applyFeedbackSizeUniform();
  }

  private resizeFeedback(width: number, height: number): void {
    if (!this.feedbackState) return;
    resizeFeedbackState(this.feedbackState, width, height);
    this.applyFeedbackSizeUniform();
  }

  private applyBuiltInUniforms(gl: GLContext, state: HostFrameState): void {
    const builtIns: Record<string, UniformInput> = {
      resolution: [state.width, state.height],
      viewportSize: [state.viewportWidth, state.viewportHeight],
      pixelRatio: state.pixelRatio,
      pointer: [state.pointer.x, state.pointer.y],
      pointerUv: [state.pointer.uvX, state.pointer.uvY],
      pointerActive: state.pointer.active,
      reducedMotion: state.reducedMotion ? 1 : 0
    };

    for (const [name, value] of Object.entries(builtIns)) {
      this.uniformCache.set(toUniformName(name), normalizeUniform(value));
    }
    this.applyFeedbackSizeUniform();
    this.applyCachedUniforms(gl);
  }

  private applyFeedbackSizeUniform(): void {
    if (!this.feedbackState) return;
    const uniform = {
      type: "vec2" as const,
      value: [
        this.feedbackState.targets.read.width,
        this.feedbackState.targets.read.height
      ]
    };
    this.uniformCache.set(this.feedbackState.options.sizeUniformName, uniform);
  }

  private applyTextureSizeUniforms(): void {
    for (const texture of this.textureSet.textures.values()) {
      this.applyTextureSizeUniform(texture);
    }
  }

  private applyTextureSizeUniform(texture: LoadedTexture): void {
    const uniform = {
      type: "vec2" as const,
      value: [texture.width, texture.height]
    };
    this.uniformCache.set(texture.sizeUniformName, uniform);

    const gl = this._gl;
    const program = this.shaderProgram;
    const location = program?.locations.get(texture.sizeUniformName);
    if (gl && program && location) {
      applyProgramUniform(gl, program.program, location, uniform);
    } else if (program) {
      this.warnUnknownUniform(texture.sizeUniformName);
    }
  }

  private applyCachedUniforms(gl: GLContext): void {
    if (!this.shaderProgram) return;
    applyUniforms(gl, this.shaderProgram.locations, this.uniformCache, (name) =>
      this.warnUnknownUniform(name)
    );
  }

  private applyFeedbackTexture(gl: GLContext): void {
    if (!this.feedbackState) return;
    const location = this.shaderProgram?.locations.get(
      this.feedbackState.options.uniformName
    );
    if (!location) {
      this.warnUnknownUniform(this.feedbackState.options.uniformName);
      return;
    }
    bindFeedbackForRead(gl, this.feedbackState, location);
  }

  private loadTextureInputs(gl: GLContext): Promise<void> {
    return this.textureSet.loadAll(gl, () => this.shaderDestroyed);
  }

  private assertNoFeedbackTextureConflict(): void {
    if (!this.feedbackOptions) return;
    if (this.textureSet.hasInput(this.feedbackOptions.uniform)) {
      throw new TextureLoadError(
        `Texture name conflicts with feedback uniform: ${this.feedbackOptions.uniform}`
      );
    }
  }

  private createRenderState(state: HostFrameState): RenderState<TUniforms> {
    return {
      instance: this,
      gl: state.gl,
      canvas: state.canvas,
      time: state.time,
      delta: state.delta,
      frame: state.frame,
      width: state.width,
      height: state.height,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight,
      pixelRatio: state.pixelRatio,
      reducedMotion: state.reducedMotion
    };
  }

  private warnUnknownUniform(name: string): void {
    if (!this.options.debug || this.warnedUniforms.has(name)) return;
    this.warnedUniforms.add(name);
    console.warn(`[frapx/shader] Uniform not found or optimized out: ${name}`);
  }
}
