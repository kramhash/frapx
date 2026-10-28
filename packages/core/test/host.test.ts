import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeHost } from "../src/host";
import {
  DestroyedError,
  TargetNotFoundError,
  UnsupportedError
} from "../src/internal/errors";
import type {
  GLContext,
  HostFrameState,
  RenderTarget,
  RuntimeHostOptions
} from "../src/types";

// --- Controllable browser-environment harness -------------------------------
// The host only needs a context object it passes through to callbacks, plus
// the DOM observers it wires up. Everything is stubbed so a test can flip
// visibility, intersection and reduced motion, and drive frames by hand.

type Listener = (event: unknown) => void;

let intersectionCb: ((entries: unknown[]) => void) | null = null;
let visibilityCb: Listener | null = null;
let mediaCb: ((event: { matches: boolean }) => void) | null = null;
let documentHidden = false;
let mediaMatches = false;
let rafCallbacks: Array<(t: number) => void> = [];
let resizeObservers = 0;
let intersectionObservers = 0;
let createdElements: Canvas[] = [];
let maxViewport = 4096;

const createMockGl = (): GLContext =>
  ({
    MAX_VIEWPORT_DIMS: 3386,
    MAX_RENDERBUFFER_SIZE: 34024,
    FRAMEBUFFER: 36160,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    FLOAT: 5126,
    getParameter: vi.fn((parameter: number) =>
      parameter === 3386 ? new Int32Array([maxViewport, maxViewport]) : 16384
    ),
    bindFramebuffer: vi.fn(),
    // Tags the first channel of every row with its GL row index (bottom = 0).
    readPixels: vi.fn(
      (
        _x: number,
        _y: number,
        width: number,
        height: number,
        _format: number,
        _type: number,
        data: Uint8Array | Float32Array
      ) => {
        for (let row = 0; row < height; row++) data[row * width * 4] = row;
      }
    )
  }) as unknown as GLContext;

class Canvas {
  width = 300;
  height = 150;
  clientWidth = 200;
  clientHeight = 100;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = { add: vi.fn() };
  listeners = new Map<string, Listener>();

  getBoundingClientRect(): DOMRect {
    return {
      width: this.clientWidth,
      height: this.clientHeight,
      left: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  toBlob(callback: (blob: Blob | null) => void, type?: string): void {
    callback(new Blob([], { type: type ?? "image/png" }));
  }
  removeEventListener(): void {}
  remove(): void {}

  dispatch(type: string, event: unknown = {}): void {
    this.listeners.get(type)?.(event);
  }
}

beforeEach(() => {
  intersectionCb = null;
  visibilityCb = null;
  mediaCb = null;
  documentHidden = false;
  mediaMatches = false;
  rafCallbacks = [];
  resizeObservers = 0;
  intersectionObservers = 0;
  createdElements = [];
  maxViewport = 4096;

  vi.stubGlobal("window", {
    devicePixelRatio: 2,
    matchMedia: (query: string) => ({
      matches: query.includes("reduce") ? mediaMatches : false,
      media: query,
      addEventListener: (_type: string, cb: typeof mediaCb) => {
        mediaCb = cb;
      },
      removeEventListener: vi.fn()
    })
  });
  vi.stubGlobal("document", {
    get hidden() {
      return documentHidden;
    },
    querySelector: () => null,
    createElement: () => {
      const canvas = new Canvas();
      createdElements.push(canvas);
      return canvas;
    },
    addEventListener: (type: string, cb: Listener) => {
      if (type === "visibilitychange") visibilityCb = cb;
    },
    removeEventListener: vi.fn()
  });
  vi.stubGlobal("getComputedStyle", () => ({ position: "relative" }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: unknown[]) => void) {
        intersectionCb = cb;
        intersectionObservers += 1;
      }
      observe(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor() {
        resizeObservers += 1;
      }
      observe(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    rafCallbacks = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const setIntersecting = (value: boolean) => {
  intersectionCb?.([{ isIntersecting: value }]);
};
const setHidden = (value: boolean) => {
  documentHidden = value;
  visibilityCb?.(new Event("visibilitychange"));
};
const tick = (ms: number) => {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  for (const cb of callbacks) cb(ms);
};

const create = (overrides: Partial<RuntimeHostOptions> = {}) => {
  const frames: HostFrameState[] = [];
  const canvas = new Canvas();
  const host = createRuntimeHost({
    canvas: canvas as unknown as HTMLCanvasElement,
    createContext: createMockGl,
    onInit: () => {},
    onDraw: (state) => {
      frames.push(state);
    },
    ...overrides
  });
  return { host, frames, canvas };
};

describe("manual clock", () => {
  it("never schedules an animation frame", async () => {
    const { host, frames } = create({ clock: "manual" });
    await host.ready;

    expect(host.clock).toBe("manual");
    expect(host.status).toBe("paused");
    expect(rafCallbacks).toHaveLength(0);
    expect(frames).toHaveLength(0);
  });

  it("renders on demand even while hidden and offscreen", async () => {
    const { host, frames } = create({ clock: "manual" });
    await host.ready;

    setHidden(true);
    setIntersecting(false);
    host.render();

    expect(frames).toHaveLength(1);
  });

  it("drives u_time from setTime and derives the delta between calls", async () => {
    const { host, frames } = create({ clock: "manual" });
    await host.ready;

    host.setTime(1.5);
    host.render();
    host.setTime(2.25);
    host.render();
    host.render();
    host.setTime(1);
    host.render();

    expect(frames.map((f) => [f.time, f.delta])).toEqual([
      [1.5, 0],
      [2.25, 0.75],
      [2.25, 0.75],
      [1, -1.25]
    ]);
  });

  it("does not render when setTime is called", async () => {
    const { host, frames } = create({ clock: "manual" });
    await host.ready;
    host.setTime(3);
    expect(frames).toHaveLength(0);
  });

  it("reads back the time of the last frame drawn", async () => {
    const { host } = create({ clock: "manual" });
    await host.ready;

    expect(host.time).toBe(0);
    host.setTime(3);
    expect(host.time).toBe(3);
    host.setTime(7.5);
    expect(host.time).toBe(7.5);
  });

  it("reports a neutral pointer and no reduced motion", async () => {
    mediaMatches = true;
    const { host, frames, canvas } = create({ clock: "manual" });
    await host.ready;

    canvas.dispatch("pointermove", { clientX: 50, clientY: 25 });
    host.render();

    expect(frames[0]?.pointer).toEqual({ x: 0, y: 0, uvX: 0, uvY: 0, active: 0 });
    expect(frames[0]?.reducedMotion).toBe(false);
  });

  it("does not render on input changes in demand mode", async () => {
    const { host, frames, canvas } = create({
      clock: "manual",
      renderMode: "demand"
    });
    await host.ready;

    canvas.dispatch("pointermove", { clientX: 10, clientY: 10 });
    host.resize();

    expect(frames).toHaveLength(0);
  });

  it("rejects non-finite times", async () => {
    const { host } = create({ clock: "manual" });
    expect(() => host.setTime(Number.NaN)).toThrow(RangeError);
  });
});

describe("setClock", () => {
  it("switches a running loop to manual and back", async () => {
    const { host } = create();
    await host.ready;
    expect(host.status).toBe("running");
    expect(rafCallbacks).toHaveLength(1);

    host.setClock("manual");
    expect(host.status).toBe("paused");
    expect(rafCallbacks).toHaveLength(0);

    host.setClock("realtime");
    expect(host.status).toBe("running");
    expect(rafCallbacks).toHaveLength(1);
  });

  it("honours gates that changed while manual", async () => {
    const { host } = create();
    await host.ready;

    host.setClock("manual");
    setHidden(true);
    host.setClock("realtime");

    expect(host.status).toBe("paused");
    setHidden(false);
    expect(host.status).toBe("running");
  });

  it("does not resume a stopped instance", async () => {
    const { host } = create({ autoStart: false });
    await host.ready;

    host.setClock("manual");
    host.setClock("realtime");

    expect(rafCallbacks).toHaveLength(0);
  });

  it("starts manual deltas fresh after switching", async () => {
    const { host, frames } = create({ clock: "manual" });
    await host.ready;

    host.setTime(5);
    host.setClock("realtime");
    host.setClock("manual");
    host.setTime(7);
    host.render();

    expect(frames[0]?.delta).toBe(0);
  });
});

describe("realtime setTime", () => {
  it("reads back the advancing realtime clock", async () => {
    const { host, frames } = create();
    await host.ready;

    tick(1000);
    expect(host.time).toBe(0);
    tick(1050);
    expect(host.time).toBeCloseTo(0.05);
    expect(host.time).toBe(frames.at(-1)?.time);
    tick(1100);
    expect(host.time).toBeCloseTo(0.1);
    expect(host.time).toBe(frames.at(-1)?.time);
  });

  it("keeps the last frame's time while a gate stops the loop", async () => {
    const { host, frames } = create();
    await host.ready;

    tick(1000);
    tick(1050);
    expect(host.time).toBeCloseTo(0.05);
    const stoppedTime = host.time;
    const drawn = frames.length;

    setHidden(true);
    tick(2000);

    expect(host.status).toBe("paused");
    expect(frames).toHaveLength(drawn);
    expect(host.time).toBe(stoppedTime);
  });

  it("seeks the running clock", async () => {
    const { host, frames } = create();
    await host.ready;

    tick(1000);
    host.setTime(10);
    tick(1050);

    const last = frames.at(-1);
    expect(last?.time).toBeCloseTo(10.05);
    expect(last?.delta).toBeCloseTo(0.05);
  });
});

describe("time source", () => {
  it("reads back the last sampled source value without sampling again", async () => {
    let now = 4;
    const source = vi.fn(() => now);
    const { host } = create({ timeSource: source });
    await host.ready;

    tick(1000);
    expect(host.time).toBe(4);
    now = 17.5;
    expect(host.time).toBe(4);
    expect(source).toHaveBeenCalledTimes(1);

    tick(1050);
    expect(host.time).toBe(17.5);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("warns under debug that demand mode never reads the source", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { host } = create({ renderMode: "demand", debug: true, timeSource: () => 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not read with renderMode \"demand\""));
    warn.mockClear();
    host.setTimeSource(null);
    create({ debug: true, timeSource: () => 1 });
    expect(warn).not.toHaveBeenCalled();
    host.setTimeSource(() => 2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("takes each frame's time from the source and the delta between frames", async () => {
    let now = 4;
    const { host, frames } = create({ timeSource: () => now });
    await host.ready;

    tick(1000);
    now = 4.02;
    tick(1016);
    now = 4.5;
    tick(1033);

    expect(frames.map((f) => [f.time, f.delta])).toEqual([
      [4, 0],
      [4.02, expect.closeTo(0.02)],
      [4.5, 0.1]
    ]);
  });

  it("gives a zero delta when the source jumps back", async () => {
    let now = 8;
    const { host, frames } = create({ timeSource: () => now });
    await host.ready;

    tick(1000);
    now = 0.01;
    tick(1016);

    expect(frames.at(-1)).toMatchObject({ time: 0.01, delta: 0 });
  });

  it("holds the previous time when the source returns a non-finite value", async () => {
    let now = 2;
    const { host, frames } = create({ timeSource: () => now });
    await host.ready;

    tick(1000);
    now = Number.NaN;
    tick(1016);

    expect(frames.at(-1)).toMatchObject({ time: 2, delta: 0 });
  });

  it("pauses while hidden and resumes at the source's current time", async () => {
    let now = 1;
    const { host, frames } = create({ timeSource: () => now });
    await host.ready;
    tick(1000);

    setHidden(true);
    expect(host.status).toBe("paused");
    expect(rafCallbacks).toHaveLength(0);

    now = 9;
    setHidden(false);
    tick(5000);

    expect(frames).toHaveLength(2);
    expect(frames.at(-1)).toMatchObject({ time: 9, delta: 0 });
  });

  it("holds a static frame at the source's time under reduced motion", async () => {
    let now = 3;
    const { host, frames } = create({
      timeSource: () => now,
      respectReducedMotion: true
    });
    await host.ready;
    tick(1000);

    now = 3.5;
    mediaCb?.({ matches: true });

    expect(host.status).toBe("paused");
    expect(rafCallbacks).toHaveLength(0);
    expect(frames.at(-1)).toMatchObject({ time: 3.5, delta: 0, reducedMotion: true });
  });

  it("keeps pointer input", async () => {
    const { host, frames, canvas } = create({ timeSource: () => 1 });
    await host.ready;

    canvas.dispatch("pointermove", { clientX: 50, clientY: 25 });
    tick(1000);

    expect(frames.at(-1)?.pointer.active).toBe(1);
  });

  it("is ignored by a manual clock and kept for the return to realtime", async () => {
    const { host, frames } = create({ timeSource: () => 6 });
    await host.ready;

    host.setClock("manual");
    host.setTime(2);
    host.render();
    expect(frames.at(-1)?.time).toBe(2);

    host.setClock("realtime");
    tick(1000);
    expect(frames.at(-1)?.time).toBe(6);
  });

  it("can be set and removed while running", async () => {
    let now = 20;
    const { host, frames } = create();
    await host.ready;
    tick(1000);
    tick(1050);

    host.setTimeSource(() => now);
    expect(host.timeSource).not.toBeNull();
    tick(1100);
    expect(frames.at(-1)).toMatchObject({ time: 20, delta: 0 });

    host.setTimeSource(null);
    now = 99;
    tick(1150);
    expect(frames.at(-1)?.time).toBeCloseTo(20.05);
  });

  it("lets render() and captureFrame() redraw at the last frame's time", async () => {
    let now = 1;
    const { host, frames } = create({ timeSource: () => now });
    await host.ready;
    tick(1000);

    host.stop();
    now = 2;
    host.render();
    await host.captureFrame({ format: "rgba8" });

    expect(frames.map((f) => f.time)).toEqual([1, 1, 1]);
  });
});

describe("fixed resolution", () => {
  it("keeps the internal size independent of the target size", async () => {
    const { host, frames, canvas } = create({
      clock: "manual",
      resolution: [800, 600]
    });
    await host.ready;

    host.render();
    canvas.clientWidth = 400;
    canvas.clientHeight = 150;
    host.render();

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(frames.map((f) => [f.width, f.height])).toEqual([
      [800, 600],
      [800, 600]
    ]);
    // Viewport still tracks the displayed size.
    expect(frames[1]?.viewportWidth).toBe(400);
    expect(frames[1]?.viewportHeight).toBe(150);
    expect(canvas.style.objectFit).toBe("contain");
  });

  it("derives the pixel ratio from the letterboxed fit, ignoring dpr", async () => {
    const { host, frames } = create({
      clock: "manual",
      resolution: [800, 600],
      dpr: 3
    });
    await host.ready;
    host.render();

    // 800x600 in a 200x100 box: height-bound, 6 internal px per CSS px.
    expect(frames[0]?.pixelRatio).toBe(6);
  });

  it("maps the pointer into the letterboxed content area", async () => {
    const { host, frames, canvas } = create({ resolution: [100, 100] });
    await host.ready;
    tick(16);

    // 100x100 contained in 200x100 → content spans x ∈ [50, 150].
    canvas.dispatch("pointermove", { clientX: 100, clientY: 25 });
    tick(32);

    const pointer = frames.at(-1)?.pointer;
    expect(pointer?.uvX).toBeCloseTo(0.5);
    expect(pointer?.uvY).toBeCloseTo(0.75);
    expect(pointer?.x).toBeCloseTo(50);
    expect(pointer?.y).toBeCloseTo(75);
  });

  it("follows the target again after setResolution(null)", async () => {
    const onResize = vi.fn();
    const { host, frames, canvas } = create({
      clock: "manual",
      resolution: [800, 600],
      onResize
    });
    await host.ready;

    host.setResolution(null);
    host.render();

    // 200x100 target at devicePixelRatio 2.
    expect(frames[0]?.width).toBe(400);
    expect(frames[0]?.height).toBe(200);
    expect(canvas.style.objectFit).toBe("");
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it("switches to a fixed size at runtime", async () => {
    const { host, frames } = create({ clock: "manual" });
    await host.ready;

    host.setResolution([1920, 1080]);
    host.render();

    expect(frames[0]?.width).toBe(1920);
    expect(frames[0]?.height).toBe(1080);
  });

  it("marks the instance unsupported when the size exceeds GPU limits", async () => {
    maxViewport = 1024;
    const onError = vi.fn();
    const { host } = create({ resolution: [3840, 2160], onError });

    await expect(host.ready).rejects.toBeInstanceOf(UnsupportedError);
    expect(host.status).toBe("unsupported");
    expect(onError).toHaveBeenCalledWith(expect.any(UnsupportedError));
  });

  it("throws from setResolution when the size exceeds GPU limits", async () => {
    maxViewport = 1024;
    const { host, frames } = create({ clock: "manual" });
    await host.ready;

    expect(() => host.setResolution([3840, 2160])).toThrow(UnsupportedError);
    host.render();
    expect(frames[0]?.width).toBe(400);
  });

  it("rejects invalid sizes", () => {
    expect(() => create({ resolution: [0, 100] })).toThrow(RangeError);
    expect(() => create({ resolution: [Number.NaN, 100] })).toThrow(RangeError);
  });
});

describe("onResize", () => {
  it("calls onResize when a frame picks up a new size before the resize observer", async () => {
    // Browsers run animation frames before resize observations, so a running
    // loop measures the new size first.
    const order: string[] = [];
    const onResize = vi.fn((state: HostFrameState) => {
      order.push(`resize ${state.width}x${state.height}`);
    });
    const { host, canvas } = create({
      onResize,
      onDraw: (state) => {
        order.push(`draw ${state.width}x${state.height}`);
      }
    });
    await host.ready;
    tick(0);

    canvas.clientWidth = 300;
    tick(16);
    host.resize();

    // 300x100 target at devicePixelRatio 2.
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(order.slice(-2)).toEqual(["resize 600x200", "draw 600x200"]);
  });
});

describe("detached canvas", () => {
  const createDetached = (overrides: Partial<RuntimeHostOptions> = {}) => {
    const frames: HostFrameState[] = [];
    const host = createRuntimeHost({
      createContext: createMockGl,
      onInit: () => {},
      onDraw: (state) => {
        frames.push(state);
      },
      ...overrides
    });
    return { host, frames };
  };

  it("renders without a target when a resolution is given", async () => {
    const { host, frames } = createDetached({
      clock: "manual",
      resolution: [640, 360]
    });
    await host.ready;
    host.render();

    expect(createdElements).toHaveLength(1);
    expect(host.canvas).toBe(createdElements[0]);
    expect(frames[0]).toMatchObject({
      width: 640,
      height: 360,
      viewportWidth: 640,
      viewportHeight: 360,
      pixelRatio: 1
    });
    expect(resizeObservers).toBe(0);
    expect(intersectionObservers).toBe(0);
  });

  it("keeps running in realtime without an intersection gate", async () => {
    const { host } = createDetached({ resolution: [64, 64] });
    await host.ready;
    expect(host.status).toBe("running");
  });

  it("refuses to drop the fixed resolution", async () => {
    const { host } = createDetached({ resolution: [64, 64] });
    await host.ready;
    expect(() => host.setResolution(null)).toThrow(TypeError);
  });

  it("fails when a given target does not resolve, even with a resolution", async () => {
    const onError = vi.fn();
    const { host } = createDetached({
      target: ".missing",
      resolution: [64, 64],
      onError
    });
    await expect(host.ready).rejects.toBeInstanceOf(TargetNotFoundError);
    expect(host.status).toBe("unsupported");
    expect(onError).toHaveBeenCalledWith(expect.any(TargetNotFoundError));
  });

  it("still fails without a target when no resolution is given", async () => {
    const { host } = createDetached();
    await expect(host.ready).rejects.toBeInstanceOf(TargetNotFoundError);
    expect(host.status).toBe("unsupported");
  });
});

describe("ready rejection", () => {
  // Swaps out the runner's own listeners so a loud rejection can be asserted
  // instead of failing the run.
  const collectUnhandled = async (run: () => void): Promise<unknown[]> => {
    const reasons: unknown[] = [];
    const previous = process.listeners("unhandledRejection");
    const listener = (reason: unknown) => {
      reasons.push(reason);
    };
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", listener);
    try {
      run();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", listener);
      for (const restore of previous) process.on("unhandledRejection", restore);
    }
    return reasons;
  };

  it("does not surface an unawaited ready when destroyed before ready", async () => {
    let host!: ReturnType<typeof create>["host"];
    const reasons = await collectUnhandled(() => {
      host = create().host;
      host.destroy();
    });

    expect(reasons).toEqual([]);
    await expect(host.ready).rejects.toBeInstanceOf(DestroyedError);
  });

  it("does not surface an unawaited ready when WebGL is unsupported", async () => {
    let host!: ReturnType<typeof create>["host"];
    const reasons = await collectUnhandled(() => {
      host = create({ createContext: () => null }).host;
    });

    expect(reasons).toEqual([]);
    expect(host.status).toBe("unsupported");
    await expect(host.ready).rejects.toBeInstanceOf(UnsupportedError);
  });

  it("still surfaces initialization failures and a missing target", async () => {
    const failure = new Error("compile failed");
    const reasons = await collectUnhandled(() => {
      create({
        onInit: () => {
          throw failure;
        }
      });
      createRuntimeHost({
        target: ".missing",
        createContext: createMockGl,
        onInit: () => {},
        onDraw: () => {}
      });
    });

    expect(reasons).toEqual([failure, expect.any(TargetNotFoundError)]);
  });
});

describe("captureFrame", () => {
  const floatSource = {
    texture: {},
    framebuffer: { id: "float" },
    width: 2,
    height: 3,
    format: "rgba16f"
  } as unknown as RenderTarget;

  it("draws a frame and returns rgba8 rows top first", async () => {
    const { host, frames } = create({ clock: "manual", resolution: [2, 3] });
    await host.ready;
    host.setTime(2);

    const data = await host.captureFrame({ format: "rgba8" });

    expect(frames).toHaveLength(1);
    expect(frames[0]!.time).toBe(2);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data).toHaveLength(2 * 3 * 4);
    // GL rows are bottom-up; the capture must start with the top row.
    expect([data[0], data[8], data[16]]).toEqual([2, 1, 0]);
    const gl = host.gl as unknown as { bindFramebuffer: ReturnType<typeof vi.fn> };
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(36160, null);
  });

  it("draws even while the realtime loop is paused by visibility", async () => {
    const { host, frames } = create({ resolution: [2, 2] });
    await host.ready;
    setHidden(true);
    host.render();
    expect(frames).toHaveLength(0);

    await host.captureFrame({ format: "rgba8" });
    expect(frames).toHaveLength(1);
  });

  it("encodes png through the canvas by default", async () => {
    const { host, frames, canvas } = create({ clock: "manual", resolution: [2, 2] });
    const toBlob = vi.spyOn(canvas, "toBlob");
    await host.ready;

    const blob = await host.captureFrame();

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);
  });

  it("waits for initialization before drawing", async () => {
    const { host, frames } = create({ clock: "manual", resolution: [2, 2] });
    const capture = host.captureFrame({ format: "rgba8" });
    expect(frames).toHaveLength(0);
    await capture;
    expect(frames).toHaveLength(1);
  });

  it("rejects rgba16f without a float source and does not draw", async () => {
    const { host, frames } = create({
      clock: "manual",
      resolution: [2, 3],
      captureSource: () => ({ ...floatSource, format: "rgba8" }) as RenderTarget
    });
    await host.ready;

    await expect(host.captureFrame({ format: "rgba16f" })).rejects.toBeInstanceOf(
      UnsupportedError
    );
    expect(frames).toHaveLength(0);
  });

  it("reads rgba16f from the float capture source", async () => {
    const { host } = create({
      clock: "manual",
      resolution: [2, 3],
      captureSource: () => floatSource
    });
    await host.ready;

    const data = await host.captureFrame({ format: "rgba16f" });

    expect(data).toBeInstanceOf(Float32Array);
    expect([data[0], data[8], data[16]]).toEqual([2, 1, 0]);
    const gl = host.gl as unknown as {
      bindFramebuffer: ReturnType<typeof vi.fn>;
      readPixels: ReturnType<typeof vi.fn>;
    };
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(36160, floatSource.framebuffer);
    expect(gl.readPixels.mock.calls[0]![5]).toBe(5126);
  });

  it("rejects unknown formats and destroyed hosts", async () => {
    const { host } = create({ clock: "manual", resolution: [2, 2] });
    await host.ready;
    await expect(
      host.captureFrame({ format: "jpeg" as "png" })
    ).rejects.toBeInstanceOf(RangeError);

    host.destroy();
    await expect(host.captureFrame()).rejects.toBeInstanceOf(DestroyedError);
  });

  it("reads rgba16f from an rgba32f capture source", async () => {
    const { host } = create({
      clock: "manual",
      resolution: [2, 3],
      captureSource: () => ({ ...floatSource, format: "rgba32f" }) as RenderTarget
    });
    await host.ready;

    const data = await host.captureFrame({ format: "rgba16f" });
    expect(data).toBeInstanceOf(Float32Array);
  });

  it("rejects an aborted capture without drawing", async () => {
    const { host, frames } = create({ clock: "manual", resolution: [2, 2] });
    await host.ready;
    const controller = new AbortController();
    controller.abort(new Error("stop"));

    await expect(
      host.captureFrame({ format: "rgba8", signal: controller.signal })
    ).rejects.toThrow("stop");
    expect(frames).toHaveLength(0);
  });

  describe("with onCaptureDraw", () => {
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };

    it("draws through the hook, holding the render lock until it settles", async () => {
      const step = deferred();
      const captured: HostFrameState[] = [];
      const signals: Array<AbortSignal | undefined> = [];
      const { host, frames } = create({
        clock: "manual",
        resolution: [2, 3],
        onCaptureDraw: async (state, signal) => {
          captured.push(state);
          signals.push(signal);
          await step.promise;
        }
      });
      await host.ready;
      host.setTime(1.5);
      const controller = new AbortController();

      const capture = host.captureFrame({ format: "rgba8", signal: controller.signal });
      await Promise.resolve();
      await Promise.resolve();
      expect(captured).toHaveLength(1);
      expect(captured[0]!.time).toBe(1.5);
      expect(signals[0]).toBe(controller.signal);

      // Other draws wait until the capture draw settles.
      host.render();
      expect(frames).toHaveLength(0);
      await expect(host.captureFrame()).rejects.toThrow("while a frame is drawing");

      step.resolve();
      const data = await capture;
      expect(data).toHaveLength(2 * 3 * 4);
      expect(frames).toHaveLength(0);

      host.render();
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(1);
    });

    it("rejects when the host is destroyed while drawing", async () => {
      const step = deferred();
      const { host } = create({
        clock: "manual",
        resolution: [2, 2],
        onCaptureDraw: () => step.promise
      });
      await host.ready;

      const capture = host.captureFrame({ format: "rgba8" });
      await Promise.resolve();
      await Promise.resolve();
      host.destroy();
      step.resolve();

      await expect(capture).rejects.toBeInstanceOf(DestroyedError);
    });

    it("rejects when the context is lost and restored while drawing", async () => {
      const step = deferred();
      const { host, canvas } = create({
        clock: "manual",
        resolution: [2, 2],
        onCaptureDraw: () => step.promise
      });
      await host.ready;

      const capture = host.captureFrame({ format: "rgba8" });
      await Promise.resolve();
      await Promise.resolve();
      canvas.dispatch("webglcontextlost", { preventDefault: () => {} });
      canvas.dispatch("webglcontextrestored");
      expect(host.gl).not.toBeNull();
      step.resolve();

      await expect(capture).rejects.toThrow("lost while capturing");
    });

    it("defers resizes requested while drawing until the frame is read", async () => {
      const step = deferred();
      const resized: HostFrameState[] = [];
      const { host } = create({
        clock: "manual",
        resolution: [2, 3],
        onResize: (state) => {
          resized.push(state);
        },
        onCaptureDraw: () => step.promise
      });
      await host.ready;

      const capture = host.captureFrame({ format: "rgba8" });
      await Promise.resolve();
      await Promise.resolve();
      host.setResolution([4, 4]);
      expect(resized).toHaveLength(0);
      step.resolve();

      const data = await capture;
      expect(data).toHaveLength(2 * 3 * 4);
      expect(resized).toHaveLength(1);
      expect([resized[0]!.width, resized[0]!.height]).toEqual([4, 4]);
    });

    it("skips realtime frames while the capture draw is pending", async () => {
      const step = deferred();
      const { host, frames } = create({
        resolution: [2, 2],
        onCaptureDraw: () => step.promise
      });
      await host.ready;
      tick(0);
      const drawn = frames.length;

      const capture = host.captureFrame({ format: "rgba8" });
      await Promise.resolve();
      await Promise.resolve();
      tick(16);
      expect(frames).toHaveLength(drawn);

      step.resolve();
      await capture;
      tick(32);
      expect(frames).toHaveLength(drawn + 1);
    });
  });

  it("releases the render lock when drawing throws", async () => {
    let fail = true;
    const { host, frames } = create({
      clock: "manual",
      resolution: [2, 2],
      onDraw: (state) => {
        if (fail) throw new Error("draw failed");
        frames.push(state);
      }
    });
    await host.ready;

    await expect(host.captureFrame()).rejects.toThrow("draw failed");
    fail = false;
    host.render();
    expect(frames).toHaveLength(1);
  });
});
