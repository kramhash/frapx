import {
  DestroyedError,
  UnsupportedError,
  applyUniforms,
  createBlitter,
  createFullscreenProgram,
  createRenderTarget,
  createRuntimeHost,
  createTextureSet,
  createUniformBindings,
  normalizeUniform,
  resolveRenderTargetFormat,
  toUniformName,
  waitForGpu
} from "@frapx/core";
import type {
  Blitter,
  FullscreenProgram,
  GLContext,
  HostFrameState,
  NormalizedUniform,
  RenderTarget,
  RuntimeHostInstance,
  TextureSet,
  TimeSource,
  UniformBindings,
  UniformSource
} from "@frapx/core";
import { SIMULATION_UNIFORMS, resolveConfig, type ResolvedConfig } from "./internal/config";
import { ParticleState, createProgram, type Program } from "./internal/gl";
import { LUT_WIDTH, buildLut } from "./internal/lut";
import {
  renderFragment,
  renderVertex,
  simulationFragment,
  simulationVertex,
  unpremultiplyFragment
} from "./internal/shaders";
import { SpawnCounter, planSteps } from "./internal/stepper";
import type {
  BlendMode,
  CaptureFormat,
  CaptureOptions,
  CaptureResult,
  ClockMode,
  ColorStop,
  CreateParticlesOptions,
  ParticleUniformName,
  ParticlesInstance,
  Resolution,
  ShaderStatus,
  UniformInput
} from "./types";

// Steps a capture submits between GPU waits while catching up to a far time,
// so a long replay never trips the browser's GPU watchdog.
const CAPTURE_STEP_BATCH = 256;

const UNIFORM_NAMES: ReadonlySet<string> = new Set<ParticleUniformName>([
  "rate",
  "gravity",
  "drag",
  "curlStrength",
  "curlScale",
  "curlSpeed",
  "pointerStrength",
  "pointerRadius",
  "opacity",
  "twinkle",
  "perspective"
]);

export const createParticles = (options: CreateParticlesOptions = {}): ParticlesInstance =>
  new Particles(options);

type GlResources = {
  gl: WebGL2RenderingContext;
  state: ParticleState;
  simulation: Program;
  render: Program;
  lut: WebGLTexture;
  lutUnit: number;
  /** Premultiplied particle layer at full precision, when `format` is `"rgba16f"`. */
  layer: RenderTarget | null;
  /** Straight-alpha copy of `layer` for captures. */
  straight: RenderTarget | null;
  unpremultiply: FullscreenProgram | null;
  blitter: Blitter | null;
};

class Particles implements ParticlesInstance {
  readonly ready: Promise<void>;

  private readonly options: CreateParticlesOptions;
  private readonly config: ResolvedConfig;
  private readonly host: RuntimeHostInstance;
  private readonly uniforms = new Map<string, NormalizedUniform>();
  private readonly bindings: UniformBindings = createUniformBindings();
  private readonly textureSet: TextureSet;
  private readonly spawns = new SpawnCounter();

  private resources: GlResources | null = null;
  private destroyed = false;
  private color: string | readonly ColorStop[];
  private palette: readonly string[] | null;
  private blend: BlendMode;
  private lutDirty = true;
  /** Index of the next simulation step. */
  private next = 0;
  /** The state must restart from the prewarmed start before the next frame. */
  private dirty = true;
  /** A realtime setTime() asked to land exactly, not drop time. */
  private seeking = false;
  private warnedOverflow = false;
  private readonly warned = new Set<string>();

  constructor(options: CreateParticlesOptions) {
    this.options = options;
    this.config = resolveConfig(options);
    for (const [name, value] of this.config.uniforms) {
      this.uniforms.set(toUniformName(name), value);
    }
    this.color = this.config.color;
    this.palette = this.config.palette;
    this.blend = this.config.blend;
    const sprite = this.config.sprite;
    this.textureSet = createTextureSet(typeof sprite === "object" ? { sprite: sprite.texture } : {});

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
      ...(options.clock !== undefined && { clock: options.clock }),
      ...(options.timeSource !== undefined && { timeSource: options.timeSource }),
      ...(options.resolution !== undefined && { resolution: options.resolution }),
      ...(options.debug !== undefined && { debug: options.debug }),

      createContext: (canvas) => {
        const gl = canvas.getContext("webgl2", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false
        });
        if (!gl) throw new UnsupportedError("@frapx/fx-particles needs WebGL2.");
        return gl;
      },

      onInit: async (gl, width, height) => {
        this.initGl(gl, width, height);
        await this.textureSet.loadAll(gl, () => this.destroyed);
      },

      onDraw: (state) => {
        if (this.destroyed || !this.resources) return;
        this.advance(state);
        this.drawFrame(state, false);
      },

      // Spawns are placed by aspect ratio, so a new size changes the timeline.
      onResize: () => this.simulationChanged(),

      onCaptureDraw: (state, signal) => this.drawCapture(state, signal),

      captureSource: () => this.resources?.straight ?? null,

      onContextLost: () => {
        // Everything GL is gone with the context; rebuilt on restore.
        this.resources = null;
      },

      onContextRestored: async (gl, width, height) => {
        this.initGl(gl, width, height);
        await this.textureSet.loadAll(gl, () => this.destroyed);
      },

      onReady: () => options.onReady?.(this),
      ...(options.onError !== undefined && { onError: options.onError })
    });

    this.ready = this.host.ready;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.host.canvas;
  }

  get gl(): WebGL2RenderingContext | null {
    return this.resources?.gl ?? null;
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

  get maxParticles(): number {
    return this.config.pool;
  }

  get simulationRate(): number {
    return this.config.simulationRate;
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
    if (this.destroyed) return;
    this.host.setTime(seconds);
    // The source overrides the time next frame, so there is nothing to land on.
    if (this.host.clock === "realtime" && !this.host.timeSource) this.seeking = true;
  }

  setClock(clock: ClockMode): void {
    if (this.destroyed || clock === this.host.clock) return;
    // Realtime steps dropped time and felt the pointer, so a manual clock
    // starts over to stay reproducible.
    if (clock === "manual") this.dirty = true;
    this.host.setClock(clock);
  }

  setTimeSource(source: TimeSource | null): void {
    if (this.destroyed) return;
    this.seeking = false;
    this.host.setTimeSource(source);
  }

  setResolution(resolution: Resolution | null): void {
    if (this.destroyed) return;
    this.host.setResolution(resolution);
  }

  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>> {
    return this.host.captureFrame(options);
  }

  reset(): void {
    this.dirty = true;
  }

  setUniform(name: ParticleUniformName, value: UniformInput): void {
    if (this.destroyed) return;
    if (!UNIFORM_NAMES.has(name)) {
      this.warn(`Unknown particle uniform: ${name}`);
      return;
    }
    if (!this.config.uniforms.has(name)) {
      this.warn(`Uniform ${name} has no effect: its force was not configured.`);
    }
    this.uniforms.set(toUniformName(name), normalizeUniform(value));
    if (SIMULATION_UNIFORMS.has(name)) this.simulationChanged();
  }

  setUniforms(values: Partial<Record<ParticleUniformName, UniformInput>>): void {
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) this.setUniform(name as ParticleUniformName, value);
    }
  }

  bindUniforms(source: UniformSource): () => void {
    if (this.destroyed) return () => {};
    const remove = this.bindings.add(source);
    this.simulationChanged();
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      remove();
      this.simulationChanged();
    };
  }

  setColor(color: string | readonly ColorStop[]): void {
    buildLut(color, this.palette);
    this.color = color;
    this.lutDirty = true;
  }

  setPalette(palette: readonly string[] | null): void {
    const next = palette && palette.length > 0 ? palette : null;
    if (next && next.length > LUT_WIDTH) {
      throw new RangeError(`palette holds at most ${LUT_WIDTH} colors`);
    }
    buildLut(this.color, next);
    this.palette = next;
    this.lutDirty = true;
  }

  setBlend(blend: BlendMode): void {
    if (blend !== "additive" && blend !== "normal") {
      throw new RangeError(`Unknown blend: ${String(blend)}`);
    }
    this.blend = blend;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.resources) {
      this.textureSet.dispose(this.resources.gl);
      disposeResources(this.resources);
    }
    this.resources = null;
    this.host.destroy();
  }

  // --- Simulation ------------------------------------------------------------

  // A manual clock treats uniforms and bindings as fixed over the whole
  // timeline, so a change replays from the start; a realtime one carries on.
  private simulationChanged(): void {
    if (this.host.clock === "manual") this.dirty = true;
  }

  private plan(state: HostFrameState) {
    const exact = this.host.clock === "manual" || this.seeking;
    this.seeking = false;
    const plan = planSteps({
      next: this.next,
      dirty: this.dirty,
      time: state.time,
      rate: this.config.simulationRate,
      prewarmSteps: this.config.prewarmSteps,
      exact
    });
    if (plan.reset) {
      this.resources!.state.clear();
      this.spawns.reset();
      this.next = -this.config.prewarmSteps;
      this.dirty = false;
    }
    return plan;
  }

  private advance(state: HostFrameState): void {
    const plan = this.plan(state);
    if (this.next < plan.runTo) {
      this.beginSimulation(state);
      while (this.next < plan.runTo) this.runStep();
    }
    this.next = Math.max(this.next, plan.skipTo);
  }

  private async advanceInBatches(
    state: HostFrameState,
    signal: AbortSignal | undefined
  ): Promise<void> {
    let plan = this.plan(state);
    while (this.next < plan.runTo) {
      const resources = this.resources;
      if (!resources) throw new UnsupportedError("The WebGL context was lost while capturing.");
      this.beginSimulation(state);
      const batchEnd = Math.min(plan.runTo, this.next + CAPTURE_STEP_BATCH);
      while (this.next < batchEnd) this.runStep();
      if (this.next < plan.runTo) {
        await waitForGpu(resources.gl);
        if (this.destroyed) throw new DestroyedError("Particles were destroyed.");
        signal?.throwIfAborted();
        // A uniform or binding changed meanwhile: finishing with the new values
        // would mix two timelines in one frame, so start over with them.
        if (this.dirty && this.resources) plan = this.plan(state);
      }
    }
    this.next = Math.max(this.next, plan.skipTo);
  }

  // Binds the simulation program and the uniforms that hold for every step.
  private beginSimulation(state: HostFrameState): void {
    const { gl, simulation, state: particles } = this.resources!;
    const config = this.config;
    gl.useProgram(simulation.program);
    const set = (name: string, apply: (location: WebGLUniformLocation) => void) => {
      const location = simulation.locations.get(name);
      if (location) apply(location);
    };
    applyUniforms(gl, simulation.locations, this.uniforms);
    set("u_dt", (l) => gl.uniform1f(l, 1 / config.simulationRate));
    set("u_seed", (l) => gl.uniform1ui(l, config.seed));
    set("u_pool", (l) => gl.uniform1ui(l, particles.pool));
    set("u_area", (l) => gl.uniform4f(l, ...config.area));
    set("u_depthRange", (l) => gl.uniform2f(l, ...config.depth));
    set("u_lifetime", (l) => gl.uniform2f(l, ...config.lifetime));
    set("u_velocityMin", (l) => gl.uniform3f(l, ...config.velocityMin));
    set("u_velocityMax", (l) => gl.uniform3f(l, ...config.velocityMax));
    set("u_spin", (l) => gl.uniform2f(l, ...config.spin));
    set("u_aspect", (l) => gl.uniform1f(l, state.width / Math.max(state.height, 1)));
    set("u_pointerUv", (l) => gl.uniform2f(l, state.pointer.uvX, state.pointer.uvY));
    set("u_pointerActive", (l) => gl.uniform1f(l, state.pointer.active));
  }

  // Runs step `next` with the simulation program bound.
  private runStep(): void {
    const { gl, simulation, state: particles } = this.resources!;
    const config = this.config;
    const time = this.next / config.simulationRate;
    const bound = this.bindings.size > 0 ? this.bindings.evaluate(time) : null;
    if (bound) applyUniforms(gl, simulation.locations, bound);

    const rate = (bound?.get("u_rate") ?? this.uniforms.get("u_rate"))?.value[0] ?? 0;
    const spawn = this.spawns.next(rate, 1 / config.simulationRate, particles.pool);
    // The ring reuses the oldest slot, so beyond this live particles are
    // recycled before their lifetime ends.
    if (!this.warnedOverflow && rate * config.lifetime[1] > particles.pool) {
      this.warnedOverflow = true;
      this.warn(
        `rate ${rate} keeps up to ${Math.ceil(rate * config.lifetime[1])} particles alive, more than the pool of ${particles.pool}; the oldest are recycled early. Raise maxParticles.`
      );
    }
    const set = (name: string, apply: (location: WebGLUniformLocation) => void) => {
      const location = simulation.locations.get(name);
      if (location) apply(location);
    };
    set("u_time", (l) => gl.uniform1f(l, time));
    // Absolute spawn indices wrap at 2^32 like the GLSL uints they feed.
    set("u_spawnBase", (l) => gl.uniform1ui(l, spawn.base >>> 0));
    set("u_spawnSlot", (l) => gl.uniform1ui(l, spawn.base % particles.pool));
    set("u_spawnCount", (l) => gl.uniform1ui(l, spawn.count));
    particles.step();
    this.next += 1;
  }

  // --- Drawing ---------------------------------------------------------------

  private drawFrame(state: HostFrameState, forCapture: boolean): void {
    const resources = this.resources!;
    const { gl, render, layer } = resources;
    if (this.lutDirty) this.uploadLut(resources);

    if (layer && (layer.width !== state.width || layer.height !== state.height)) {
      layer.resize(state.width, state.height);
      resources.straight!.resize(state.width, state.height);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, layer?.framebuffer ?? null);
    gl.viewport(0, 0, state.width, state.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(render.program);
    applyUniforms(gl, render.locations, this.uniforms);
    if (this.bindings.size > 0) {
      applyUniforms(gl, render.locations, this.bindings.evaluate(state.time));
    }
    const set = (name: string, apply: (location: WebGLUniformLocation) => void) => {
      const location = render.locations.get(name);
      if (location) apply(location);
    };
    set("u_aspect", (l) => gl.uniform1f(l, state.width / Math.max(state.height, 1)));
    set("u_size", (l) => gl.uniform2f(l, ...this.config.size));
    set("u_paletteSize", (l) => gl.uniform1f(l, this.palette?.length ?? 0));
    gl.activeTexture(gl.TEXTURE0 + resources.lutUnit);
    gl.bindTexture(gl.TEXTURE_2D, resources.lut);
    set("u_lut", (l) => gl.uniform1i(l, resources.lutUnit));
    this.textureSet.bind(gl, render.locations);

    gl.enable(gl.BLEND);
    if (this.blend === "additive") {
      // Light adds up; coverage composites over what is behind.
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    resources.state.draw();
    gl.disable(gl.BLEND);

    if (!layer) return;
    if (forCapture) {
      const straight = resources.straight!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, straight.framebuffer);
      gl.viewport(0, 0, straight.width, straight.height);
      const program = resources.unpremultiply!;
      program.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, layer.texture);
      const location = program.locations.get("u_texture");
      if (location) gl.uniform1i(location, 0);
      program.draw();
    }
    resources.blitter!.blit(layer.texture, null, state.width, state.height);
  }

  private async drawCapture(state: HostFrameState, signal: AbortSignal | undefined): Promise<void> {
    if (!this.resources) throw new UnsupportedError("Cannot capture without a WebGL context.");
    await this.advanceInBatches(state, signal);
    if (!this.resources) throw new UnsupportedError("The WebGL context was lost while capturing.");
    // Runs in the task that settles, so the host reads it before compositing.
    this.drawFrame(state, true);
  }

  private uploadLut(resources: GlResources): void {
    const { gl } = resources;
    gl.activeTexture(gl.TEXTURE0 + resources.lutUnit);
    gl.bindTexture(gl.TEXTURE_2D, resources.lut);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      LUT_WIDTH,
      2,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buildLut(this.color, this.palette)
    );
    this.lutDirty = false;
  }

  // --- GL resources ----------------------------------------------------------

  private initGl(context: GLContext, width: number, height: number): void {
    const gl = context as WebGL2RenderingContext;
    if (this.resources) disposeResources(this.resources);
    this.resources = null;
    if (this.host.canvas) this.host.canvas.dataset.frapxParticlesCanvas = "";

    const created: Array<{ dispose(): void }> = [];
    try {
      const simulation = createProgram(gl, simulationVertex(this.config), simulationFragment, true);
      created.push(simulation);
      const render = createProgram(gl, renderVertex(this.config), renderFragment(this.config), false);
      created.push(render);
      const state = new ParticleState(gl, this.config.pool);
      created.push(state);

      const lut = gl.createTexture()!;
      created.push({ dispose: () => gl.deleteTexture(lut) });
      const lutUnit = this.textureSet.reserveUnit(gl, "lut");
      gl.activeTexture(gl.TEXTURE0 + lutUnit);
      gl.bindTexture(gl.TEXTURE_2D, lut);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      let layer: RenderTarget | null = null;
      let straight: RenderTarget | null = null;
      let unpremultiply: FullscreenProgram | null = null;
      let blitter: Blitter | null = null;
      const wantsFloat =
        this.options.format === "rgba16f" &&
        resolveRenderTargetFormat(gl, "rgba16f", this.options.formatFallback ?? true) === "rgba16f";
      if (wantsFloat) {
        const targetOptions = { format: "rgba16f" as const, formatFallback: false };
        layer = createRenderTarget(gl, width, height, targetOptions);
        created.push(layer);
        straight = createRenderTarget(gl, width, height, targetOptions);
        created.push(straight);
        unpremultiply = createFullscreenProgram(gl, unpremultiplyFragment);
        created.push(unpremultiply);
        blitter = createBlitter(gl);
        created.push(blitter);
      }

      this.resources = {
        gl,
        state,
        simulation,
        render,
        lut,
        lutUnit,
        layer,
        straight,
        unpremultiply,
        blitter
      };
    } catch (error) {
      for (const resource of created) resource.dispose();
      throw error;
    }
    this.lutDirty = true;
    this.dirty = true;
  }

  private warn(message: string): void {
    if (!this.options.debug || this.warned.has(message)) return;
    this.warned.add(message);
    console.warn(`[frapx/particles] ${message}`);
  }
}

const disposeResources = (resources: GlResources): void => {
  resources.simulation.dispose();
  resources.render.dispose();
  resources.state.dispose();
  resources.gl.deleteTexture(resources.lut);
  resources.layer?.dispose();
  resources.straight?.dispose();
  resources.unpremultiply?.dispose();
  resources.blitter?.dispose();
};
