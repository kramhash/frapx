import type {
  CreateShaderBackgroundOptions,
  RenderState,
  ShaderBackgroundInstance,
  ShaderStatus,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue
} from "./types";
import {
  DestroyedError,
  TargetNotFoundError,
  UnsupportedError
} from "./internal/errors";
import {
  resolveDpr,
  resizeCanvasToTarget,
  setupCanvas,
  type DomSetup
} from "./internal/dom";
import { toUniformName } from "./internal/names";
import { loadTextures, type LoadedTexture } from "./internal/textures";
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
  private uniformLocations = new Map<string, WebGLUniformLocation>();
  private textures: LoadedTexture[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private rafId = 0;
  private running = false;
  private inRender = false;
  private destroyed = false;
  private onscreen = true;
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

    if (!this.onscreen && (this.options.pauseWhenOffscreen ?? true)) {
      this.currentStatus = "paused";
      return;
    }

    if (this.options.renderMode === "demand") {
      this.currentStatus = "running";
      this.render();
      return;
    }

    this.currentStatus = "running";
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    this.cancelFrame();
    if (!this.destroyed && this.currentStatus !== "unsupported") {
      this.currentStatus = "paused";
    }
  }

  render(): void {
    if (
      this.destroyed ||
      !this.dom ||
      !this.program ||
      this.currentStatus === "unsupported" ||
      (this.options.pauseWhenOffscreen ?? true) && !this.onscreen
    ) {
      return;
    }

    const gl = this.dom.canvas.getContext("webgl");
    if (!gl) return;

    this.inRender = true;
    this.resize();
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    this.applyBuiltInUniforms(gl);
    this.applyCachedUniforms(gl);
    this.applyTextures(gl);

    const state = this.createRenderState(gl);
    this.options.onBeforeRender?.(state);
    this.applyCachedUniforms(gl);

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
      for (const texture of this.textures) gl.deleteTexture(texture.texture);
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
      this.onscreen
    ) {
      this.render();
    }
  }

  setUniforms(values: Record<string, UniformInput>): void {
    for (const [name, value] of Object.entries(values)) {
      this.setUniform(name, value);
    }
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
      this.textures = await loadTextures(
        gl,
        this.options.textures,
        () => this.destroyed
      );
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
    this.uniformLocations = collectUniformLocations(gl, this.program);
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
        this.onscreen = Boolean(entry?.isIntersecting);
        if (!this.onscreen) {
          this.cancelFrame();
          if (this.running) this.currentStatus = "paused";
          return;
        }

        if (this.running) {
          this.start();
        } else if (this.options.renderMode === "demand") {
          this.render();
        }
      });
      this.intersectionObserver.observe(this.dom.target);
    }

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
        void loadTextures(gl, this.options.textures, () => this.destroyed).then(
          (textures) => {
            this.textures = textures;
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
      pointerActive: this.pointer.active
    };

    for (const [name, value] of Object.entries(builtIns)) {
      this.uniformCache.set(toUniformName(name), normalizeUniform(value));
    }

    this.applyCachedUniforms(gl);
  }

  private applyTextureSizeUniforms(): void {
    for (const texture of this.textures) {
      this.uniformCache.set(texture.sizeUniformName, {
        type: "vec2",
        value: [texture.width, texture.height]
      });
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
    for (let unit = 0; unit < this.textures.length; unit += 1) {
      const texture = this.textures[unit];
      if (!texture) continue;
      const location = this.uniformLocations.get(texture.uniformName);
      if (!location) continue;

      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniform1i(location, unit);
    }
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
      pixelRatio: this.pixelRatio
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
