import type {
  CreateShaderBackgroundOptions,
  RenderState,
  ShaderBackgroundInstance,
  ShaderStatus,
  TextureInput,
  TextureMap,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue
} from "./types";
import {
  DestroyedError,
  TargetNotFoundError,
  TextureLoadError,
  UnsupportedError
} from "./internal/errors";
import {
  resolveDpr,
  resizeCanvasToTarget,
  setupCanvas,
  type DomSetup
} from "./internal/dom";
import { toUniformName } from "./internal/names";
import { loadTexture, type LoadedTexture } from "./internal/textures";
import {
  applyProgramUniform,
  applyUniform,
  collectUniformLocations,
  createUniformCache,
  normalizeUniform,
  type NormalizedUniform
} from "./internal/uniforms";
import {
  createFullscreenBuffer,
  createProgram,
  defaultVertexShader
} from "./internal/webgl";

const MAX_DELTA_SECONDS = 0.1;

// A "closed" gate suppresses the render loop. The instance runs only when the
// user intends it to (start()) AND every gate is open (the set is empty).
// "offscreen"/"hidden" are visibility gates: they suppress all rendering.
// "reducedMotion" is a motion gate: it stops the loop but allows one static
// frame, and only applies to the continuous (non-demand) render mode.
type Gate = "offscreen" | "hidden" | "reducedMotion";

export const createShaderBackground = <
  TUniforms extends UniformInputMap = UniformInputMap
>(
  options: CreateShaderBackgroundOptions<TUniforms>
): ShaderBackgroundInstance<TUniforms> => {
  return new ShaderBackground<TUniforms>(options);
};

class ShaderBackground<TUniforms extends UniformInputMap>
  implements ShaderBackgroundInstance<TUniforms>
{
  readonly ready: Promise<void>;

  private readonly options: CreateShaderBackgroundOptions<TUniforms>;
  private readonly uniformCache: Map<string, NormalizedUniform>;
  private readonly warnedUniforms = new Set<string>();
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private dom: DomSetup | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private attribLocation = -1;
  private uniformLocations = new Map<string, WebGLUniformLocation>();
  private textureInputs = new Map<string, TextureInput>();
  private textures = new Map<string, LoadedTexture>();
  private textureUnits = new Map<string, number>();
  private textureVersions = new Map<string, number>();
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private rafId = 0;
  private running = false;
  private inRender = false;
  private destroyed = false;
  private gates = new Set<Gate>();
  private reducedMotionActive = false;
  private frame = 0;
  private elapsed = 0;
  private lastTimestamp = 0;
  private pixelRatio = 1;
  private width = 1;
  private height = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private pointer = { x: 0, y: 0, uvX: 0, uvY: 0, active: 0 };
  private removeListeners: Array<() => void> = [];
  private currentStatus: ShaderStatus = "idle";
  private contextRestoredShouldRun = false;

  constructor(options: CreateShaderBackgroundOptions<TUniforms>) {
    this.options = options;
    this.uniformCache = createUniformCache(options.uniforms);
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    queueMicrotask(() => {
      void this.init();
    });
  }

  get canvas(): HTMLCanvasElement | null {
    return this.dom?.canvas ?? null;
  }

  get gl(): WebGLRenderingContext | null {
    return this.dom?.canvas.getContext("webgl") ?? null;
  }

  get status(): ShaderStatus {
    return this.currentStatus;
  }

  get supported(): boolean {
    return !["unsupported", "destroyed"].includes(this.currentStatus);
  }

  start(): void {
    if (this.destroyed || this.currentStatus === "unsupported") return;
    this.running = true;
    this.reconcile();
  }

  stop(): void {
    this.running = false;
    this.cancelFrame();
    if (!this.destroyed && this.currentStatus !== "unsupported") {
      this.currentStatus = "paused";
    }
  }

  // A visibility gate ("offscreen"/"hidden") suppresses all rendering.
  private get hasVisibilityBlock(): boolean {
    return this.gates.has("offscreen") || this.gates.has("hidden");
  }

  // The motion gate only stops the continuous loop; demand mode has no loop to
  // throttle, so reduced motion does not apply there.
  private get hasMotionBlock(): boolean {
    return (
      this.gates.has("reducedMotion") && this.options.renderMode !== "demand"
    );
  }

  // Open or close a gate, then reconcile the runtime to the new gate set.
  private setGate(gate: Gate, closed: boolean): void {
    if (closed === this.gates.has(gate)) return;
    if (closed) this.gates.add(gate);
    else this.gates.delete(gate);
    this.reconcile();
  }

  // Single source of truth: derive the runtime state from intent + gates.
  // Every lifecycle event funnels through here so the result is consistent
  // regardless of which event (start, visibility, reduced-motion) triggered it.
  private reconcile(): void {
    if (
      this.destroyed ||
      this.currentStatus === "unsupported" ||
      this.currentStatus === "error" ||
      this.currentStatus === "context-lost"
    ) {
      return;
    }

    if (this.running) {
      if (this.hasVisibilityBlock) {
        this.cancelFrame();
        this.currentStatus = "paused";
        return;
      }

      if (this.hasMotionBlock) {
        // Reduced motion: hold a single static frame instead of animating.
        this.cancelFrame();
        this.currentStatus = "paused";
        this.renderStaticFrame();
        return;
      }

      this.currentStatus = "running";
      if (this.options.renderMode === "demand") this.render();
      else this.scheduleFrame();
      return;
    }

    // Not running: in demand mode keep the static frame fresh when visible
    // (e.g. scrolled back on screen). render() no-ops if a visibility gate is
    // closed, so this is safe to call unconditionally.
    if (this.options.renderMode === "demand") this.render();
  }

  // Render one frame at the current (frozen) time without scheduling more.
  private renderStaticFrame(): void {
    if (this.hasVisibilityBlock) return;
    this.setBuiltInTime(0);
    this.render();
  }

  render(): void {
    if (
      this.destroyed ||
      !this.dom ||
      !this.program ||
      this.currentStatus === "unsupported" ||
      this.hasVisibilityBlock
    ) {
      return;
    }

    const gl = this.dom.canvas.getContext("webgl");
    if (!gl) return;

    this.inRender = true;
    this.resize();
    // Reset to the default framebuffer each frame so a render-target left bound
    // by an extension (e.g. in onAfterRender) cannot leak into this frame.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    this.applyBuiltInUniforms(gl);

    const state = this.createRenderState(gl);
    this.options.onBeforeRender?.(state);
    // Re-establish all of the core's draw state after the user hook so any GL
    // side-effects (program, array buffer, attrib pointer, textures) cannot
    // corrupt the core draw. This is what makes the core a safe FBO host.
    this.prepareDrawState(gl);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.options.onAfterRender?.(state);
    this.frame += 1;
    this.inRender = false;
  }

  resize(): void {
    if (this.destroyed || !this.dom) return;
    this.pixelRatio = resolveDpr(this.options.dpr, this.options.maxDpr);
    const size = resizeCanvasToTarget(
      this.dom.canvas,
      this.dom.target,
      this.pixelRatio
    );
    this.width = size.width;
    this.height = size.height;
    this.viewportWidth = size.viewportWidth;
    this.viewportHeight = size.viewportHeight;

    if (this.options.renderMode === "demand" && !this.inRender) {
      this.render();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.cancelFrame();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();

    for (const remove of this.removeListeners) remove();
    this.removeListeners = [];

    const gl = this.dom?.canvas.getContext("webgl");
    if (gl) {
      for (const texture of this.textures.values()) {
        gl.deleteTexture(texture.texture);
      }
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
    }

    if (this.dom?.createdCanvas) {
      this.dom.canvas.remove();
    }

    const dom = this.dom;
    if (dom?.restoredPosition !== null && dom && this.options.target) {
      const target = dom.target as HTMLElement;
      target.style.position = dom.restoredPosition;
    }

    this.currentStatus = "destroyed";
    this.readyReject?.(new DestroyedError("Shader background was destroyed."));
  }

  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>
  ): void;
  setUniform(name: string, value: UniformInput): void;
  setUniform(name: string, value: UniformInput): void {
    if (this.destroyed) return;
    const uniformName = toUniformName(name);
    this.uniformCache.set(uniformName, normalizeUniform(value));

    const gl = this.dom?.canvas.getContext("webgl");
    const location = this.uniformLocations.get(uniformName);
    if (gl && this.program && location) {
      applyProgramUniform(
        gl,
        this.program,
        location,
        this.uniformCache.get(uniformName)!
      );
    } else if (this.program) {
      this.warnUnknownUniform(uniformName);
    }

    if (
      this.options.renderMode === "demand" &&
      !this.inRender &&
      !this.hasVisibilityBlock
    ) {
      this.render();
    }
  }

  setUniforms(values: Record<string, UniformInput>): void {
    for (const [name, value] of Object.entries(values)) {
      this.setUniform(name, value);
    }
  }

  async setTexture(name: string, input: TextureInput): Promise<void> {
    if (this.destroyed) return;

    let gl = this.dom?.canvas.getContext("webgl");
    if (!gl) {
      await this.ready;
      if (this.destroyed) return;
      gl = this.dom?.canvas.getContext("webgl");
    }

    if (!gl) {
      const error = new TextureLoadError(
        "Cannot set texture before WebGL is ready."
      );
      this.options.onError?.(error);
      throw error;
    }

    const version = (this.textureVersions.get(name) ?? 0) + 1;
    this.textureVersions.set(name, version);

    try {
      const unit = this.resolveTextureUnit(gl, name);
      const loaded = await loadTexture(gl, name, input, unit);

      if (this.destroyed || this.textureVersions.get(name) !== version) {
        gl.deleteTexture(loaded.texture);
        return;
      }

      const previous = this.textures.get(name);
      this.textureInputs.set(name, input);
      this.textures.set(name, loaded);
      if (previous) gl.deleteTexture(previous.texture);
      this.applyTextureSizeUniform(loaded);

      if (
        this.options.renderMode === "demand" &&
        !this.inRender &&
        !this.hasVisibilityBlock
      ) {
        this.render();
      }
    } catch (error) {
      if (!this.textures.has(name) && !this.textureInputs.has(name)) {
        this.textureUnits.delete(name);
      }
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

  private async init(): Promise<void> {
    if (typeof window === "undefined" || typeof document === "undefined") {
      this.failUnsupported(new UnsupportedError("WebGL requires a browser."));
      return;
    }

    this.dom = setupCanvas(this.options);
    if (!this.dom) {
      this.failUnsupported(new TargetNotFoundError("Target or canvas not found."));
      return;
    }

    const gl = this.dom.canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false
    });

    if (!gl) {
      this.failUnsupported(new UnsupportedError("WebGL is not supported."));
      return;
    }

    this.currentStatus = "loading";

    try {
      this.setupDomObservers();
      this.setupContextEvents();
      this.setupProgram(gl);
      this.resize();
      this.textureInputs = new Map(Object.entries(this.options.textures ?? {}));
      await this.loadTextureInputs(gl);
      if (this.destroyed) return;
      this.applyTextureSizeUniforms();
      this.currentStatus = "ready";
      this.readyResolve?.();
      this.options.onReady?.(this);

      if (this.running || (this.options.autoStart ?? true)) {
        this.start();
      } else if (this.options.renderMode === "demand") {
        this.render();
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private setupProgram(gl: WebGLRenderingContext): void {
    if (this.program) gl.deleteProgram(this.program);
    if (this.buffer) gl.deleteBuffer(this.buffer);

    this.program = createProgram(
      gl,
      this.options.vertex ?? defaultVertexShader,
      this.options.fragment
    );
    gl.useProgram(this.program);
    this.buffer = createFullscreenBuffer(gl, this.program);
    this.attribLocation = gl.getAttribLocation(this.program, "a_position");
    this.uniformLocations = collectUniformLocations(gl, this.program);
  }

  // Re-bind the core's program, fullscreen geometry, textures and uniforms so a
  // draw is correct regardless of GL state changed by onBeforeRender/onAfterRender.
  private prepareDrawState(gl: WebGLRenderingContext): void {
    if (!this.program) return;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (this.attribLocation >= 0) {
      gl.enableVertexAttribArray(this.attribLocation);
      gl.vertexAttribPointer(this.attribLocation, 2, gl.FLOAT, false, 0, 0);
    }
    this.applyTextures(gl);
    this.applyCachedUniforms(gl);
  }

  private setupDomObservers(): void {
    if (!this.dom) return;

    if (this.options.autoResize ?? true) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(this.dom.target);
    }

    if (this.options.pauseWhenOffscreen ?? true) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        this.setGate("offscreen", !entry?.isIntersecting);
      });
      this.intersectionObserver.observe(this.dom.target);
    }

    if (this.options.pauseWhenHidden ?? true) {
      if (document.hidden) this.gates.add("hidden");
      const onVisibility = () => {
        this.setGate("hidden", document.hidden);
      };
      document.addEventListener("visibilitychange", onVisibility);
      this.removeListeners.push(() => {
        document.removeEventListener("visibilitychange", onVisibility);
      });
    }

    this.setupMotionObserver();

    const onPointerMove = (event: Event) => {
      if (!this.dom) return;
      const pointerEvent = event as PointerEvent;
      const rect = this.dom.target.getBoundingClientRect();
      const x = pointerEvent.clientX - rect.left;
      const y = pointerEvent.clientY - rect.top;
      this.pointer.x = x * this.pixelRatio;
      this.pointer.y = (rect.height - y) * this.pixelRatio;
      this.pointer.uvX = rect.width > 0 ? x / rect.width : 0;
      this.pointer.uvY = rect.height > 0 ? 1 - y / rect.height : 0;
      this.pointer.active = 1;

      if (this.options.renderMode === "demand") this.render();
    };
    const onPointerLeave = () => {
      this.pointer.active = 0;
      if (this.options.renderMode === "demand") this.render();
    };

    this.dom.target.addEventListener("pointermove", onPointerMove);
    this.dom.target.addEventListener("pointerenter", onPointerMove);
    this.dom.target.addEventListener("pointerleave", onPointerLeave);
    this.removeListeners.push(() => {
      this.dom?.target.removeEventListener("pointermove", onPointerMove);
      this.dom?.target.removeEventListener("pointerenter", onPointerMove);
      this.dom?.target.removeEventListener("pointerleave", onPointerLeave);
    });
  }

  // Track the OS "prefers reduced motion" setting and keep it live: the
  // u_reducedMotion uniform always reflects the current value, and when
  // respectReducedMotion is enabled the motion gate opens/closes with it.
  private setupMotionObserver(): void {
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotionActive = query.matches;
    if (this.options.respectReducedMotion && query.matches) {
      this.gates.add("reducedMotion");
    }

    const onChange = (event: MediaQueryListEvent) => {
      this.reducedMotionActive = event.matches;
      if (this.options.respectReducedMotion) {
        this.setGate("reducedMotion", event.matches);
      } else if (this.options.renderMode === "demand") {
        // Reflect the new uniform value in the static frame immediately;
        // the continuous loop picks it up on the next frame on its own.
        this.render();
      }
    };

    query.addEventListener("change", onChange);
    this.removeListeners.push(() => {
      query.removeEventListener("change", onChange);
    });
  }

  private setupContextEvents(): void {
    if (!this.dom) return;

    const onLost = (event: Event) => {
      event.preventDefault();
      this.contextRestoredShouldRun = this.running;
      this.cancelFrame();
      this.currentStatus = "context-lost";
      this.options.onError?.(new UnsupportedError("WebGL context lost."));
    };

    const onRestored = () => {
      if (!this.dom || this.destroyed) return;
      const gl = this.dom.canvas.getContext("webgl");
      if (!gl) return;

      try {
        this.setupProgram(gl);
        this.applyCachedUniforms(gl);
        void this.loadTextureInputs(gl).then(
          () => {
            this.applyTextureSizeUniforms();
            if (this.contextRestoredShouldRun) this.start();
            else this.render();
          },
          (error: unknown) =>
            this.fail(error instanceof Error ? error : new Error(String(error)))
        );
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    };

    this.dom.canvas.addEventListener("webglcontextlost", onLost);
    this.dom.canvas.addEventListener("webglcontextrestored", onRestored);
    this.removeListeners.push(() => {
      this.dom?.canvas.removeEventListener("webglcontextlost", onLost);
      this.dom?.canvas.removeEventListener("webglcontextrestored", onRestored);
    });
  }

  private scheduleFrame(): void {
    if (this.rafId || this.options.renderMode === "demand") return;

    this.rafId = requestAnimationFrame((timestamp) => {
      this.rafId = 0;
      if (!this.running || this.destroyed) return;

      const seconds = timestamp / 1000;
      const rawDelta = this.lastTimestamp ? seconds - this.lastTimestamp : 0;
      const delta = Math.min(Math.max(rawDelta, 0), MAX_DELTA_SECONDS);
      this.lastTimestamp = seconds;
      this.elapsed += delta;
      this.setBuiltInTime(delta);
      this.render();
      this.scheduleFrame();
    });
  }

  private cancelFrame(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.lastTimestamp = 0;
  }

  private setBuiltInTime(delta: number): void {
    this.uniformCache.set("u_time", { type: "float", value: [this.elapsed] });
    this.uniformCache.set("u_delta", { type: "float", value: [delta] });
  }

  private applyBuiltInUniforms(gl: WebGLRenderingContext): void {
    const builtIns: Record<string, UniformInput> = {
      resolution: [this.width, this.height],
      viewportSize: [this.viewportWidth, this.viewportHeight],
      pixelRatio: this.pixelRatio,
      pointer: [this.pointer.x, this.pointer.y],
      pointerUv: [this.pointer.uvX, this.pointer.uvY],
      pointerActive: this.pointer.active,
      reducedMotion: this.reducedMotionActive ? 1 : 0
    };

    for (const [name, value] of Object.entries(builtIns)) {
      this.uniformCache.set(toUniformName(name), normalizeUniform(value));
    }

    this.applyCachedUniforms(gl);
  }

  private applyTextureSizeUniforms(): void {
    for (const texture of this.textures.values()) {
      this.applyTextureSizeUniform(texture);
    }
  }

  private applyTextureSizeUniform(texture: LoadedTexture): void {
    const uniform = {
      type: "vec2" as const,
      value: [texture.width, texture.height]
    };
    this.uniformCache.set(texture.sizeUniformName, uniform);

    const gl = this.dom?.canvas.getContext("webgl");
    const location = this.uniformLocations.get(texture.sizeUniformName);
    if (gl && this.program && location) {
      applyProgramUniform(gl, this.program, location, uniform);
    } else if (this.program) {
      this.warnUnknownUniform(texture.sizeUniformName);
    }
  }

  private applyCachedUniforms(gl: WebGLRenderingContext): void {
    for (const [name, uniform] of this.uniformCache) {
      const location = this.uniformLocations.get(name);
      if (!location) {
        this.warnUnknownUniform(name);
        continue;
      }
      applyUniform(gl, location, uniform);
    }
  }

  private applyTextures(gl: WebGLRenderingContext): void {
    for (const texture of this.textures.values()) {
      const unit = this.textureUnits.get(texture.name);
      if (unit === undefined) continue;
      const location = this.uniformLocations.get(texture.uniformName);
      if (!location) {
        this.warnUnknownUniform(texture.uniformName);
        continue;
      }

      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniform1i(location, unit);
    }
  }

  private async loadTextureInputs(gl: WebGLRenderingContext): Promise<void> {
    const loadedTextures = new Map<string, LoadedTexture>();

    for (const [name, input] of this.textureInputs) {
      if (this.destroyed) break;
      const unit = this.resolveTextureUnit(gl, name);
      loadedTextures.set(name, await loadTexture(gl, name, input, unit));
    }

    for (const texture of this.textures.values()) {
      gl.deleteTexture(texture.texture);
    }
    this.textures = loadedTextures;
  }

  private resolveTextureUnit(gl: WebGLRenderingContext, name: string): number {
    const existing = this.textureUnits.get(name);
    if (existing !== undefined) return existing;

    const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;

    for (let unit = 0; unit < maxUnits; unit += 1) {
      if (![...this.textureUnits.values()].includes(unit)) {
        this.textureUnits.set(name, unit);
        return unit;
      }
    }

    throw new TextureLoadError(
      `Texture unit limit exceeded while loading texture: ${name}`
    );
  }

  private createRenderState(
    gl: WebGLRenderingContext
  ): RenderState<TUniforms> {
    return {
      instance: this,
      gl,
      canvas: this.dom!.canvas,
      time: this.elapsed,
      delta: this.uniformCache.get("u_delta")?.value[0] ?? 0,
      frame: this.frame,
      width: this.width,
      height: this.height,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      pixelRatio: this.pixelRatio,
      reducedMotion: this.reducedMotionActive
    };
  }

  private warnUnknownUniform(name: string): void {
    if (!this.options.debug || this.warnedUniforms.has(name)) return;
    this.warnedUniforms.add(name);
    console.warn(`[frapx/shader] Uniform not found or optimized out: ${name}`);
  }

  private failUnsupported(error: Error): void {
    this.currentStatus = "unsupported";
    this.debugWarn(error.message);
    this.options.onError?.(error);
    this.readyReject?.(error);
  }

  private fail(error: Error): void {
    this.currentStatus = "error";
    this.debugWarn(error.message);
    this.options.onError?.(error);
    this.readyReject?.(error);
  }

  private debugWarn(message: string): void {
    if (this.options.debug) {
      console.warn(`[frapx/shader] ${message}`);
    }
  }
}
