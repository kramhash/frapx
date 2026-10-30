import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShaderBackground, DestroyedError, UnsupportedError } from "../src";
import type { RenderState } from "../src";

// --- Controllable browser-environment harness -------------------------------
// The package targets the browser but tests run under Node, so we stub just
// enough of the DOM to drive the lifecycle: visibility, intersection and the
// reduced-motion media query are all captured so a test can flip them.

type Listener = (event: unknown) => void;

let intersectionCb: ((entries: unknown[]) => void) | null = null;
let visibilityCb: Listener | null = null;
let mediaCb: ((event: { matches: boolean }) => void) | null = null;
let documentHidden = false;
let mediaMatches = false;
let rafCallbacks: Array<(t: number) => void> = [];
let cancelledRaf: number[] = [];
const documentRemove = vi.fn();
const mediaRemove = vi.fn();

const createMockGl = () => {
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ACTIVE_UNIFORMS: 35718,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    COLOR_BUFFER_BIT: 16384,
    FRAMEBUFFER: 36160,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    createShader: vi.fn(() => ({ id: "shader" })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    createProgram: vi.fn(() => ({ id: "program" })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_p: unknown, parameter: number) =>
      parameter === 35718 ? 0 : true
    ),
    getProgramInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({ id: "buffer" })),
    deleteBuffer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getActiveUniform: vi.fn(() => null),
    getUniformLocation: vi.fn(() => null),
    getParameter: vi.fn(() => 8),
    bindFramebuffer: vi.fn(),
    viewport: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn()
  };
  return gl as unknown as WebGLRenderingContext & {
    drawArrays: ReturnType<typeof vi.fn>;
  };
};

class Canvas {
  width = 32;
  height = 16;
  clientWidth = 32;
  clientHeight = 16;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = { add: vi.fn() };
  readonly gl = createMockGl();

  getContext(): WebGLRenderingContext {
    return this.gl;
  }

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

  addEventListener(): void {}
  removeEventListener(): void {}
  remove(): void {}
}

beforeEach(() => {
  intersectionCb = null;
  visibilityCb = null;
  mediaCb = null;
  documentHidden = false;
  mediaMatches = false;
  rafCallbacks = [];
  cancelledRaf = [];

  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    matchMedia: (query: string) => ({
      matches: query.includes("reduce") ? mediaMatches : false,
      media: query,
      addEventListener: (_type: string, cb: typeof mediaCb) => {
        mediaCb = cb;
      },
      removeEventListener: mediaRemove
    })
  });
  vi.stubGlobal("document", {
    get hidden() {
      return documentHidden;
    },
    addEventListener: (type: string, cb: Listener) => {
      if (type === "visibilitychange") visibilityCb = cb;
    },
    removeEventListener: documentRemove
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: unknown[]) => void) {
        intersectionCb = cb;
      }
      observe(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal("HTMLImageElement", class {});
  vi.stubGlobal("HTMLCanvasElement", Canvas);
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    cancelledRaf.push(id);
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
const setReducedMotion = (value: boolean) => {
  mediaMatches = value;
  mediaCb?.({ matches: value });
};

const create = (
  overrides: Partial<Parameters<typeof createShaderBackground>[0]> = {}
) =>
  createShaderBackground({
    canvas: new Canvas() as unknown as HTMLCanvasElement,
    fragment: "void main() { gl_FragColor = vec4(1.0); }",
    ...overrides
  });

describe("lifecycle gates", () => {
  it("auto-starts running with default options", async () => {
    const fx = create();
    await fx.ready;
    expect(fx.status).toBe("running");
  });

  it("pauses while the document is hidden, resumes when visible", async () => {
    const fx = create();
    await fx.ready;

    setHidden(true);
    expect(fx.status).toBe("paused");

    setHidden(false);
    expect(fx.status).toBe("running");
  });

  it("reports status changes through onStatusChange", async () => {
    const onStatusChange = vi.fn();
    const fx = create({ onStatusChange });
    await fx.ready;

    setHidden(true);
    setHidden(false);

    expect(onStatusChange.mock.calls.flat()).toEqual([
      "loading",
      "ready",
      "running",
      "paused",
      "running"
    ]);
  });

  it("pauses while offscreen, resumes when back on screen", async () => {
    const fx = create();
    await fx.ready;

    setIntersecting(false);
    expect(fx.status).toBe("paused");

    setIntersecting(true);
    expect(fx.status).toBe("running");
  });

  it("stays paused until every visibility gate is open", async () => {
    const fx = create();
    await fx.ready;

    setHidden(true);
    setIntersecting(false);
    expect(fx.status).toBe("paused");

    // One gate opens, the other is still closed.
    setHidden(false);
    expect(fx.status).toBe("paused");

    // Both gates now open.
    setIntersecting(true);
    expect(fx.status).toBe("running");
  });

  it("does not auto-pause on hidden when pauseWhenHidden is false", async () => {
    const fx = create({ pauseWhenHidden: false });
    await fx.ready;

    setHidden(true);
    expect(fx.status).toBe("running");
  });
});

describe("reduced motion", () => {
  it("holds a single static frame at init when respected and active", async () => {
    mediaMatches = true;
    const canvas = new Canvas();
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: "void main() { gl_FragColor = vec4(1.0); }",
      respectReducedMotion: true
    });
    await fx.ready;

    expect(fx.status).toBe("paused");
    // The static frame was drawn once; no animation loop was scheduled.
    expect(canvas.gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(rafCallbacks).toHaveLength(0);
  });

  it("resumes animating when reduced motion is turned off at runtime", async () => {
    mediaMatches = true;
    const fx = create({ respectReducedMotion: true });
    await fx.ready;
    expect(fx.status).toBe("paused");

    setReducedMotion(false);
    expect(fx.status).toBe("running");

    setReducedMotion(true);
    expect(fx.status).toBe("paused");
  });

  it("ignores the motion gate in demand mode", async () => {
    mediaMatches = true;
    const fx = create({ respectReducedMotion: true, renderMode: "demand" });
    await fx.ready;

    // Demand mode has no loop to throttle; reduced motion must not pause it.
    expect(fx.status).toBe("running");
  });

  it("does not pause when reduced motion is active but not respected", async () => {
    mediaMatches = true;
    const fx = create();
    await fx.ready;
    expect(fx.status).toBe("running");
  });

  it("exposes the reduced-motion flag on the render state", async () => {
    mediaMatches = true;
    let observed: boolean | null = null;
    const fx = create({
      onBeforeRender: (state: RenderState) => {
        observed = state.reducedMotion;
      }
    });
    await fx.ready;
    // Drive one frame so onBeforeRender fires.
    rafCallbacks.shift()?.(16);
    expect(observed).toBe(true);
  });
});

describe("with a time source", () => {
  it("pauses while hidden and resumes at the source's current time", async () => {
    let now = 1;
    let observed: number | null = null;
    const fx = create({
      timeSource: () => now,
      onBeforeRender: (state: RenderState) => {
        observed = state.time;
      }
    });
    await fx.ready;

    setHidden(true);
    expect(fx.status).toBe("paused");

    now = 7;
    setHidden(false);
    expect(fx.status).toBe("running");
    rafCallbacks[rafCallbacks.length - 1]?.(16);
    expect(observed).toBe(7);
  });

  it("holds a static frame at the source's time under reduced motion", async () => {
    mediaMatches = true;
    let observed: number | null = null;
    const fx = create({
      timeSource: () => 4.5,
      respectReducedMotion: true,
      onBeforeRender: (state: RenderState) => {
        observed = state.time;
      }
    });
    await fx.ready;

    expect(fx.status).toBe("paused");
    expect(rafCallbacks).toHaveLength(0);
    expect(observed).toBe(4.5);
  });
});

describe("teardown", () => {
  it("removes visibility and media listeners on destroy", async () => {
    const fx = create({ respectReducedMotion: true });
    await fx.ready;
    documentRemove.mockClear();
    mediaRemove.mockClear();

    fx.destroy();

    expect(documentRemove).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    expect(mediaRemove).toHaveBeenCalledWith("change", expect.any(Function));
    expect(fx.status).toBe("destroyed");
  });
});

describe("instance contract", () => {
  it("reports an unsupported environment without throwing when there is no browser", async () => {
    vi.stubGlobal("window", undefined);
    const onError = vi.fn();
    const onStatusChange = vi.fn();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const fx = createShaderBackground({
      target: ".hero",
      fragment: "void main() { gl_FragColor = vec4(1.0); }",
      onError,
      onStatusChange
    });
    expect(fx.status).toBe("idle");
    expect(fx.supported).toBe(true);

    await Promise.resolve();
    expect(fx.status).toBe("unsupported");
    expect(fx.supported).toBe(false);
    expect(fx.canvas).toBeNull();
    expect(fx.gl).toBeNull();
    expect(onStatusChange.mock.calls.flat()).toEqual(["unsupported"]);
    expect(onError).toHaveBeenCalledWith(expect.any(UnsupportedError));

    // Left unawaited, ready does not surface as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    await expect(fx.ready).rejects.toBeInstanceOf(UnsupportedError);
  });

  it("calls onAfterRender after the draw with the context being drawn with", async () => {
    const canvas = new Canvas();
    const onAfterRender = vi.fn((state: RenderState) => {
      expect(state.gl).toBe(canvas.gl);
      expect(canvas.gl.drawArrays).toHaveBeenCalledTimes(1);
    });
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: "void main() { gl_FragColor = vec4(1.0); }",
      onAfterRender
    });
    await fx.ready;

    rafCallbacks.shift()?.(16);
    expect(onAfterRender).toHaveBeenCalledTimes(1);
    expect(onAfterRender.mock.calls[0]![0]).toMatchObject({
      instance: fx,
      canvas,
      width: canvas.width,
      height: canvas.height
    });
  });

  it("setUniforms sets every value like setUniform", async () => {
    const canvas = new Canvas();
    const gl = Object.assign(canvas.gl, {
      uniform1f: vi.fn(),
      uniform3f: vi.fn()
    }) as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const names = ["u_progress", "u_color"];
    gl.getProgramParameter!.mockImplementation((_p: unknown, parameter: number) =>
      parameter === 35718 ? names.length : true
    );
    gl.getActiveUniform!.mockImplementation((_p: unknown, index: number) => ({
      name: names[index]
    }));
    gl.getUniformLocation!.mockImplementation((_p: unknown, name: string) => ({ name }));

    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: "void main() { gl_FragColor = vec4(1.0); }",
      autoStart: false
    });
    await fx.ready;

    fx.setUniforms({ progress: 0.5, color: [1, 0, 0] });
    expect(gl.uniform1f).toHaveBeenLastCalledWith({ name: "u_progress" }, 0.5);
    expect(gl.uniform3f).toHaveBeenLastCalledWith({ name: "u_color" }, 1, 0, 0);
  });

  it("throws RangeError from setTime for a non-finite value, and ignores calls after destroy", async () => {
    const fx = create({ clock: "manual" });
    await fx.ready;

    expect(() => fx.setTime(Number.NaN)).toThrow(RangeError);
    expect(() => fx.setTime(Number.POSITIVE_INFINITY)).toThrow(RangeError);

    fx.destroy();
    expect(() => fx.setTime(Number.NaN)).not.toThrow();
    expect(fx.supported).toBe(false);
    expect(fx.gl).toBeNull();
    await expect(fx.captureFrame()).rejects.toBeInstanceOf(DestroyedError);
  });
});
