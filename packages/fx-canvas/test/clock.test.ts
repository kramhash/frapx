import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShaderBackground } from "../src";
import type { RenderState } from "../src";

// --- Controllable browser-environment harness -------------------------------
// Mirrors the harness in onResize.test.ts. Clock and resolution behaviour is
// covered in depth by @frapx/core's host tests; this checks the wiring.

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
    getParameter: vi.fn(() => 4096),
    bindFramebuffer: vi.fn(),
    viewport: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn()
  };
  return gl as unknown as WebGLRenderingContext;
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

let rafCallbacks: Array<(t: number) => void> = [];

beforeEach(() => {
  rafCallbacks = [];

  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    matchMedia: () => ({
      matches: false,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  });
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
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
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const create = (
  canvas: Canvas,
  overrides: Partial<Parameters<typeof createShaderBackground>[0]> = {}
) =>
  createShaderBackground({
    canvas: canvas as unknown as HTMLCanvasElement,
    fragment: "void main() { gl_FragColor = vec4(1.0); }",
    ...overrides
  });

describe("clock option", () => {
  it("renders only on explicit calls with the time from setTime", async () => {
    const canvas = new Canvas();
    const states: RenderState[] = [];
    const fx = create(canvas, {
      clock: "manual",
      onBeforeRender: (state) => {
        states.push(state);
      }
    });
    await fx.ready;

    expect(fx.clock).toBe("manual");
    expect(rafCallbacks).toHaveLength(0);

    fx.setTime(2);
    fx.render();
    fx.setTime(2.5);
    fx.render();

    expect(states.map((s) => [s.time, s.delta])).toEqual([
      [2, 0],
      [2.5, 0.5]
    ]);
  });

  it("reads the current time back from the instance", async () => {
    const canvas = new Canvas();
    const fx = create(canvas, { clock: "manual" });
    await fx.ready;

    expect(fx.time).toBe(0);
    fx.setTime(4);
    fx.render();
    expect(fx.time).toBe(4);
  });

  it("switches clocks with setClock", async () => {
    const canvas = new Canvas();
    const fx = create(canvas);
    await fx.ready;

    fx.setClock("manual");
    expect(fx.clock).toBe("manual");
    expect(fx.status).toBe("paused");

    fx.setClock("realtime");
    expect(fx.status).toBe("running");
  });

  it("does not redraw on uniform changes in demand mode", async () => {
    const canvas = new Canvas();
    const draw = vi.spyOn(canvas.gl, "drawArrays");
    const fx = create(canvas, { clock: "manual", renderMode: "demand" });
    await fx.ready;

    fx.setUniform("speed", 2);
    expect(draw).not.toHaveBeenCalled();

    fx.render();
    expect(draw).toHaveBeenCalledTimes(1);
  });
});

describe("timeSource option", () => {
  it("takes the loop's time from the source and switches with setTimeSource", async () => {
    const canvas = new Canvas();
    const states: RenderState[] = [];
    let now = 12;
    const fx = create(canvas, {
      timeSource: () => now,
      onBeforeRender: (state) => {
        states.push(state);
      }
    });
    await fx.ready;
    expect(fx.clock).toBe("realtime");

    rafCallbacks.shift()?.(1000);
    now = 12.05;
    rafCallbacks.shift()?.(1016);
    fx.setTimeSource(null);
    now = 0;
    rafCallbacks.shift()?.(1032);

    expect(states.map((s) => [s.time, s.delta])).toEqual([
      [12, 0],
      [12.05, expect.closeTo(0.05)],
      [expect.closeTo(12.066), expect.closeTo(0.016)]
    ]);
  });
});

describe("resolution option", () => {
  it("renders at the fixed size and switches with setResolution", async () => {
    const canvas = new Canvas();
    const states: RenderState[] = [];
    const fx = create(canvas, {
      clock: "manual",
      resolution: [640, 360],
      onBeforeRender: (state) => {
        states.push(state);
      }
    });
    await fx.ready;

    fx.render();
    fx.setResolution([128, 128]);
    fx.render();

    expect(states.map((s) => [s.width, s.height])).toEqual([
      [640, 360],
      [128, 128]
    ]);
    expect(canvas.style.objectFit).toBe("contain");
  });
});

describe("after destroy", () => {
  it("ignores clock and resolution calls", async () => {
    const canvas = new Canvas();
    const fx = create(canvas, { clock: "manual" });
    await fx.ready;
    fx.destroy();

    expect(() => {
      fx.setTime(1);
      fx.setClock("realtime");
      fx.setTimeSource(() => 1);
      fx.setResolution([10, 10]);
    }).not.toThrow();
    expect(fx.status).toBe("destroyed");
  });
});
