import type {
  CaptureFormat,
  CaptureOptions,
  CaptureResult,
  ClockMode,
  GLContext,
  HostFrameState,
  HostPointer,
  Resolution,
  RuntimeHostInstance,
  RuntimeHostOptions,
  ShaderStatus,
  TimeSource
} from "./types";
import { DestroyedError, TargetNotFoundError, UnsupportedError } from "./internal/errors";
import { canvasToPng, readPixels } from "./internal/capture";
import {
  resolveDpr,
  resizeCanvasToResolution,
  resizeCanvasToTarget,
  setupCanvas,
  type DomSetup
} from "./internal/dom";

const MAX_DELTA_SECONDS = 0.1;

// Manual clocks report a neutral pointer so output never depends on input.
const IDLE_POINTER: HostPointer = { x: 0, y: 0, uvX: 0, uvY: 0, active: 0 };

const clampDelta = (delta: number): number =>
  Math.min(Math.max(delta, 0), MAX_DELTA_SECONDS);

type Gate = "offscreen" | "hidden" | "reducedMotion";

export const createRuntimeHost = (
  options: RuntimeHostOptions
): RuntimeHostInstance => {
  return new RuntimeHost(options);
};

class RuntimeHost implements RuntimeHostInstance {
  readonly ready: Promise<void>;

  private readonly options: RuntimeHostOptions;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private dom: DomSetup | null = null;
  private context: GLContext | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private rafId = 0;
  private running = false;
  private inRender = false;
  private captureDrawing = false;
  private resizePending = false;
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
  private statusBeforeLoss: ShaderStatus = "idle";
  private clockMode: ClockMode;
  private manualDelta = 0;
  private lastManualTime: number | null = null;
  private source: TimeSource | null;
  // The source's value at the previous loop frame; null restarts u_delta at 0.
  private lastSourceTime: number | null = null;
  private fixedResolution: Resolution | null;
  private objectFitRestore: string | null = null;
  // Letterbox offset (CSS px) of the contained canvas content inside the target.
  private contentOffsetX = 0;
  private contentOffsetY = 0;

  constructor(options: RuntimeHostOptions) {
    this.options = options;
    this.clockMode = options.clock ?? "realtime";
    this.source = options.timeSource ?? null;
    this.warnIfSourceUnread();
    this.fixedResolution = options.resolution
      ? normalizeResolution(options.resolution)
      : null;
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

  get gl(): GLContext | null {
    return this.context;
  }

  get status(): ShaderStatus {
    return this.currentStatus;
  }

  get supported(): boolean {
    return !["unsupported", "destroyed"].includes(this.currentStatus);
  }

  get clock(): ClockMode {
    return this.clockMode;
  }

  /**
   * The time of the last frame drawn, before any `accumulation.loop`
   * wrapping: the value `setTime()` would need to reproduce that frame.
   * While gated it is the time the loop stopped at, and with a time source
   * it is the last value read from the source.
   */
  get time(): number {
    return this.elapsed;
  }

  get timeSource(): TimeSource | null {
    return this.source;
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

  render(): void {
    if (
      this.destroyed ||
      !this.dom ||
      !this.context ||
      this.currentStatus === "unsupported" ||
      this.inRender
    )
      return;

    if (this.isManual) {
      // The caller decides when to draw; visibility gates do not apply.
      this.renderInternal(this.elapsed, this.manualDelta);
      return;
    }

    // Redraws at the last frame's time: refinement and reduced motion must
    // not chase a running source.
    if (this.hasVisibilityBlock) return;
    this.renderInternal(this.elapsed, 0);
  }

  setTime(seconds: number): void {
    if (!Number.isFinite(seconds)) {
      throw new RangeError(`setTime() expects a finite number, got ${seconds}`);
    }
    if (this.destroyed) return;

    if (this.isManual) {
      this.manualDelta =
        this.lastManualTime === null ? 0 : seconds - this.lastManualTime;
      this.lastManualTime = seconds;
    }
    this.elapsed = seconds;
  }

  setClock(clock: ClockMode): void {
    if (this.destroyed || clock === this.clockMode) return;
    this.clockMode = clock;
    this.manualDelta = 0;
    this.lastManualTime = null;
    // Gates kept tracking while manual, so this resumes against current state.
    this.reconcile();
  }

  setTimeSource(source: TimeSource | null): void {
    if (this.destroyed) return;
    this.source = source;
    this.lastSourceTime = null;
    this.warnIfSourceUnread();
  }

  // Only the realtime loop reads the source, and demand mode runs no loop.
  private warnIfSourceUnread(): void {
    if (this.source && this.options.renderMode === "demand") {
      this.debugWarn("`timeSource` is not read with renderMode \"demand\", which runs no frame loop. Call setTime() instead.");
    }
  }

  setResolution(resolution: Resolution | null): void {
    if (this.destroyed) return;

    if (resolution === null) {
      if (this.isDetached) {
        throw new TypeError(
          "A canvas without a target needs a fixed resolution."
        );
      }
      this.fixedResolution = null;
    } else {
      const next = normalizeResolution(resolution);
      if (this.context) assertWithinLimits(this.context, next);
      this.fixedResolution = next;
    }

    this.applyObjectFit();
    this.resize();
  }

  async captureFrame<F extends CaptureFormat = "png">(
    options: CaptureOptions<F> = {}
  ): Promise<CaptureResult<F>> {
    const format: CaptureFormat = options.format ?? "png";
    if (format !== "png" && format !== "rgba8" && format !== "rgba16f") {
      throw new RangeError(`Unknown capture format: ${String(format)}`);
    }

    await this.ready;
    if (this.destroyed) {
      throw new DestroyedError("Runtime host was destroyed.");
    }
    if (!this.dom || !this.context) {
      throw new UnsupportedError("Cannot capture without a WebGL context.");
    }
    if (this.inRender) {
      throw new Error("captureFrame() cannot be called while a frame is drawing.");
    }

    // Check before drawing so a rejected capture has no side effects.
    const sourceFormat = this.options.captureSource?.()?.format;
    if (format === "rgba16f" && sourceFormat !== "rgba16f" && sourceFormat !== "rgba32f") {
      throw new UnsupportedError(
        "rgba16f capture needs a float render target, such as feedback with format rgba16f."
      );
    }
    options.signal?.throwIfAborted();

    const delta = this.isManual ? this.manualDelta : 0;
    const drawContext = this.context;
    if (!this.options.onCaptureDraw) {
      this.renderInternal(this.elapsed, delta);
      return this.readCapture(format, drawContext);
    }

    try {
      await this.renderForCapture(this.options.onCaptureDraw, delta, options.signal);
      return this.readCapture(format, drawContext);
    } finally {
      // Resizes requested while drawing apply once the frame is read.
      if (this.resizePending) {
        this.resizePending = false;
        this.resize();
      }
    }
  }

  resize(): void {
    if (this.destroyed || !this.dom) return;
    // Keep the size an asynchronous capture draw started with until it is read.
    if (this.captureDrawing) {
      this.resizePending = true;
      return;
    }

    this.syncSize();

    if (this.shouldRenderOnDemand && !this.inRender) {
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

    this.context = null;

    if (this.dom?.createdCanvas) {
      this.dom.canvas.remove();
    } else if (this.dom && this.objectFitRestore !== null) {
      this.dom.canvas.style.objectFit = this.objectFitRestore;
    }

    const dom = this.dom;
    if (dom?.restoredPosition !== null && dom && this.options.target) {
      (dom.target as HTMLElement).style.position = dom.restoredPosition!;
    }

    this.currentStatus = "destroyed";
    this.markReadyHandled();
    this.readyReject?.(new DestroyedError("Runtime host was destroyed."));
  }

  private get isManual(): boolean {
    return this.clockMode === "manual";
  }

  private get followsSource(): boolean {
    return this.source !== null && !this.isManual;
  }

  // A non-finite reading holds the previous time instead of throwing in a frame.
  private readSource(): number | null {
    if (!this.followsSource) return null;
    const now = this.source!();
    return Number.isFinite(now) ? now : null;
  }

  // The static frame takes the source's current time without a delta.
  private syncSourceTime(): void {
    const now = this.readSource();
    if (now !== null) this.elapsed = now;
  }

  // A loop frame under a source: time is the source's value, never clamped;
  // delta is the step from the previous frame, 0 when it went back.
  private advanceFromSource(): number {
    const now = this.readSource();
    if (now === null) return 0;
    const previous = this.lastSourceTime;
    this.lastSourceTime = now;
    this.elapsed = now;
    return previous === null ? 0 : clampDelta(now - previous);
  }

  private get isDetached(): boolean {
    if (this.dom) return this.dom.detached === true;
    return this.options.target === undefined && this.options.canvas === undefined;
  }

  // Demand mode re-renders on input changes, except under a manual clock where
  // only explicit render() calls draw.
  private get shouldRenderOnDemand(): boolean {
    return this.options.renderMode === "demand" && !this.isManual;
  }

  private get hasVisibilityBlock(): boolean {
    return this.gates.has("offscreen") || this.gates.has("hidden");
  }

  private get hasMotionBlock(): boolean {
    return (
      this.gates.has("reducedMotion") && this.options.renderMode !== "demand"
    );
  }

  private setGate(gate: Gate, closed: boolean): void {
    if (closed === this.gates.has(gate)) return;
    if (closed) this.gates.add(gate);
    else this.gates.delete(gate);
    this.reconcile();
  }

  private reconcile(): void {
    if (
      this.destroyed ||
      this.currentStatus === "unsupported" ||
      this.currentStatus === "error" ||
      this.currentStatus === "context-lost"
    ) {
      return;
    }

    if (this.isManual) {
      this.cancelFrame();
      this.currentStatus = "paused";
      return;
    }

    if (this.running) {
      if (this.hasVisibilityBlock) {
        this.cancelFrame();
        this.currentStatus = "paused";
        return;
      }

      if (this.hasMotionBlock) {
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

    if (this.options.renderMode === "demand") this.render();
  }

  private renderStaticFrame(): void {
    if (this.hasVisibilityBlock) return;
    this.syncSourceTime();
    this.renderInternal(this.elapsed, 0);
  }

  private renderInternal(time: number, delta: number): void {
    // An asynchronous capture draw holds the lock across tasks.
    if (!this.dom || !this.context || this.inRender) return;
    const gl = this.context;

    this.inRender = true;
    try {
      this.syncSize();
      this.options.onDraw(this.createFrameState(time, delta, gl));
      this.frame++;
    } finally {
      this.inRender = false;
    }
  }

  // Holds the render lock across an asynchronous capture draw so no other
  // frame interleaves with it.
  private async renderForCapture(
    draw: NonNullable<RuntimeHostOptions["onCaptureDraw"]>,
    delta: number,
    signal: AbortSignal | undefined
  ): Promise<void> {
    if (!this.dom || !this.context) return;
    this.inRender = true;
    this.captureDrawing = true;
    try {
      this.syncSize();
      await draw(this.createFrameState(this.elapsed, delta, this.context), signal);
      this.frame++;
    } finally {
      this.inRender = false;
      this.captureDrawing = false;
    }
  }

  // Reads the frame just drawn, in the task that drew it: the drawing buffer
  // is not preserved. Fails if the context drawn into is gone, including when
  // it was lost and restored while an asynchronous draw was pending.
  private readCapture<F extends CaptureFormat>(
    format: CaptureFormat,
    drawContext: GLContext | null
  ): Promise<CaptureResult<F>> | CaptureResult<F> {
    if (this.destroyed) {
      throw new DestroyedError("Runtime host was destroyed.");
    }
    const gl = this.context;
    if (!gl || gl !== drawContext || !this.dom) {
      throw new UnsupportedError("The WebGL context was lost while capturing.");
    }

    if (format === "png") {
      return canvasToPng(this.dom.canvas) as Promise<CaptureResult<F>>;
    }
    if (format === "rgba8") {
      return readPixels(gl, null, this.width, this.height, "rgba8") as CaptureResult<F>;
    }
    const source = this.options.captureSource!()!;
    return readPixels(
      gl,
      source.framebuffer,
      source.width,
      source.height,
      "rgba16f"
    ) as CaptureResult<F>;
  }

  private createFrameState(
    time: number,
    delta: number,
    gl: GLContext = this.context!
  ): HostFrameState {
    return {
      gl,
      canvas: this.dom!.canvas,
      time,
      delta,
      frame: this.frame,
      width: this.width,
      height: this.height,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      pixelRatio: this.pixelRatio,
      reducedMotion: this.isManual ? false : this.reducedMotionActive,
      pointer: this.isManual ? { ...IDLE_POINTER } : { ...this.pointer }
    };
  }

  /**
   * Measures the size and calls onResize if it changed. Frames measure too:
   * browsers run animation frames before resize observations, so in a running
   * loop a frame is usually the first to see a new size.
   */
  private syncSize(): void {
    const prevWidth = this.width;
    const prevHeight = this.height;
    const prevViewportWidth = this.viewportWidth;
    const prevViewportHeight = this.viewportHeight;

    this.measureSize();

    const sizeChanged =
      this.width !== prevWidth ||
      this.height !== prevHeight ||
      this.viewportWidth !== prevViewportWidth ||
      this.viewportHeight !== prevViewportHeight;

    if (sizeChanged && this.context) {
      this.options.onResize?.(this.createFrameState(this.elapsed, 0));
    }
  }

  private measureSize(): void {
    if (!this.dom) return;

    if (this.fixedResolution) {
      const size = resizeCanvasToResolution(
        this.dom.canvas,
        this.dom.detached ? null : this.dom.target,
        this.fixedResolution
      );
      this.width = size.width;
      this.height = size.height;
      this.viewportWidth = size.viewportWidth;
      this.viewportHeight = size.viewportHeight;
      // Internal pixels per displayed CSS pixel under object-fit: contain.
      this.pixelRatio = Math.max(
        size.width / size.viewportWidth,
        size.height / size.viewportHeight
      );
      this.contentOffsetX =
        (size.viewportWidth - size.width / this.pixelRatio) / 2;
      this.contentOffsetY =
        (size.viewportHeight - size.height / this.pixelRatio) / 2;
      return;
    }

    this.contentOffsetX = 0;
    this.contentOffsetY = 0;
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
  }

  // Letterbox the fixed-resolution canvas instead of stretching it.
  private applyObjectFit(): void {
    if (!this.dom) return;
    const style = this.dom.canvas.style;
    if (this.fixedResolution && this.objectFitRestore === null) {
      this.objectFitRestore = style.objectFit ?? "";
      style.objectFit = "contain";
    } else if (!this.fixedResolution && this.objectFitRestore !== null) {
      style.objectFit = this.objectFitRestore;
      this.objectFitRestore = null;
    }
  }

  private scheduleFrame(): void {
    if (this.rafId || this.options.renderMode === "demand" || this.isManual)
      return;

    this.rafId = requestAnimationFrame((timestamp) => {
      this.rafId = 0;
      if (!this.running || this.destroyed) return;

      const seconds = timestamp / 1000;
      let delta: number;
      if (this.followsSource) {
        delta = this.advanceFromSource();
      } else {
        delta = this.lastTimestamp ? clampDelta(seconds - this.lastTimestamp) : 0;
        this.elapsed += delta;
      }
      this.lastTimestamp = seconds;
      this.renderInternal(this.elapsed, delta);
      this.scheduleFrame();
    });
  }

  private cancelFrame(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.lastTimestamp = 0;
    this.lastSourceTime = null;
  }

  private async init(): Promise<void> {
    if (typeof window === "undefined" || typeof document === "undefined") {
      this.failUnsupported(new UnsupportedError("WebGL requires a browser."));
      return;
    }

    this.dom = setupCanvas({
      ...(this.options.target !== undefined && { target: this.options.target }),
      ...(this.options.canvas !== undefined && { canvas: this.options.canvas }),
      ...(this.options.layer !== undefined && { layer: this.options.layer }),
      ...(this.options.canvasClass !== undefined && { canvasClass: this.options.canvasClass }),
      ...(this.options.canvasStyle !== undefined && { canvasStyle: this.options.canvasStyle }),
      // Only a missing target/canvas may fall back to a detached canvas; a
      // target that fails to resolve must still report TargetNotFoundError.
      detached:
        this.fixedResolution !== null &&
        this.options.target === undefined &&
        this.options.canvas === undefined
    });

    if (!this.dom) {
      this.failUnsupported(
        new TargetNotFoundError(
          "Target or canvas not found. Pass `resolution` to render without a target."
        )
      );
      return;
    }

    let gl: GLContext | null;
    try {
      gl = this.options.createContext(this.dom.canvas);
    } catch (error) {
      this.failUnsupported(
        error instanceof UnsupportedError
          ? error
          : new UnsupportedError(String(error))
      );
      return;
    }
    if (!gl) {
      this.failUnsupported(new UnsupportedError("WebGL is not supported."));
      return;
    }

    if (this.fixedResolution) {
      try {
        assertWithinLimits(gl, this.fixedResolution);
      } catch (error) {
        this.failUnsupported(
          error instanceof Error ? error : new UnsupportedError(String(error))
        );
        return;
      }
      if (this.options.dpr !== undefined || this.options.maxDpr !== undefined) {
        this.debugWarn("`dpr` and `maxDpr` are ignored while `resolution` is set.");
      }
    }

    this.context = gl;
    this.currentStatus = "loading";

    try {
      this.applyObjectFit();
      this.setupDomObservers();
      this.setupContextEvents();
      this.measureSize();
      await this.options.onInit(gl, this.width, this.height);
      if (this.destroyed) return;
      this.currentStatus = "ready";
      this.readyResolve?.();
      this.options.onReady?.();

      if (this.running || (this.options.autoStart ?? true)) {
        this.start();
      } else if (this.shouldRenderOnDemand) {
        this.render();
      }
    } catch (error) {
      if (error instanceof UnsupportedError) this.failUnsupported(error);
      else this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private setupDomObservers(): void {
    if (!this.dom) return;
    const detached = this.dom.detached === true;

    // A detached canvas has no layout: it can never be measured, scrolled into
    // view or pointed at, so only document-level observers apply.
    if (!detached && (this.options.autoResize ?? true)) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(this.dom.target);
    }

    if (!detached && (this.options.pauseWhenOffscreen ?? true)) {
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

    if (detached) return;

    const onPointerMove = (event: Event) => {
      if (!this.dom) return;
      const pointerEvent = event as PointerEvent;
      const rect = this.dom.target.getBoundingClientRect();
      const x = pointerEvent.clientX - rect.left - this.contentOffsetX;
      const y = pointerEvent.clientY - rect.top - this.contentOffsetY;
      // Displayed content size in CSS px (smaller than rect when letterboxed).
      const contentWidth = this.fixedResolution
        ? this.width / this.pixelRatio
        : rect.width;
      const contentHeight = this.fixedResolution
        ? this.height / this.pixelRatio
        : rect.height;
      this.pointer.x = x * this.pixelRatio;
      this.pointer.y = (contentHeight - y) * this.pixelRatio;
      this.pointer.uvX = contentWidth > 0 ? x / contentWidth : 0;
      this.pointer.uvY = contentHeight > 0 ? 1 - y / contentHeight : 0;
      this.pointer.active = 1;

      if (this.shouldRenderOnDemand) this.render();
    };
    const onPointerLeave = () => {
      this.pointer.active = 0;
      if (this.shouldRenderOnDemand) this.render();
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
      } else if (this.shouldRenderOnDemand) {
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
      this.statusBeforeLoss = this.currentStatus;
      this.cancelFrame();
      this.context = null;
      this.currentStatus = "context-lost";
      this.options.onContextLost?.();
      this.options.onError?.(new UnsupportedError("WebGL context lost."));
    };

    const onRestored = () => {
      if (!this.dom || this.destroyed) return;
      const gl = this.options.createContext(this.dom.canvas);
      if (!gl) return;
      this.context = gl;

      const afterRestore = async () => {
        try {
          await this.options.onContextRestored?.(gl, this.width, this.height);
          // A stopped or manual-clock instance would otherwise stay
          // "context-lost", and render() would refuse to draw.
          if (this.currentStatus === "context-lost") this.currentStatus = this.statusBeforeLoss;
          if (this.contextRestoredShouldRun) this.start();
          else if (!this.isManual) this.render();
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)));
        }
      };
      void afterRestore();
    };

    this.dom.canvas.addEventListener("webglcontextlost", onLost);
    this.dom.canvas.addEventListener("webglcontextrestored", onRestored);
    this.removeListeners.push(() => {
      this.dom?.canvas.removeEventListener("webglcontextlost", onLost);
      this.dom?.canvas.removeEventListener("webglcontextrestored", onRestored);
    });
  }

  private failUnsupported(error: Error): void {
    this.currentStatus = "unsupported";
    this.debugWarn(error.message);
    this.options.onError?.(error);
    // An unsupported environment is expected; a missing target stays loud.
    if (error instanceof UnsupportedError) this.markReadyHandled();
    this.readyReject?.(error);
  }

  private fail(error: Error): void {
    this.currentStatus = "error";
    this.debugWarn(error.message);
    this.options.onError?.(error);
    this.readyReject?.(error);
  }

  // Keeps an unawaited `ready` from surfacing as an unhandled rejection, e.g.
  // after a StrictMode cleanup or during SSR. Callers still see the rejection.
  private markReadyHandled(): void {
    this.ready.catch(() => {});
  }

  private debugWarn(message: string): void {
    if (this.options.debug) {
      console.warn(`[frapx/runtime] ${message}`);
    }
  }
}

const normalizeResolution = (resolution: Resolution): Resolution => {
  const [width, height] = resolution;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new RangeError(`Invalid resolution: ${width}x${height}`);
  }
  return [Math.round(width), Math.round(height)];
};

const assertWithinLimits = (gl: GLContext, resolution: Resolution): void => {
  const [width, height] = resolution;
  const viewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as
    | ArrayLike<number>
    | null;
  const renderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as
    | number
    | null;
  const limit = (axis: 0 | 1): number =>
    Math.min(
      viewportDims?.[axis] ?? Number.POSITIVE_INFINITY,
      typeof renderbufferSize === "number"
        ? renderbufferSize
        : Number.POSITIVE_INFINITY
    );

  if (width > limit(0) || height > limit(1)) {
    throw new UnsupportedError(
      `Resolution ${width}x${height} exceeds this GPU's limit of ${limit(0)}x${limit(1)}.`
    );
  }
};
