import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShaderBackground } from "../src";

// --- Browser-environment harness -------------------------------------------
// Same minimal stubs as lifecycle.test.ts, but the canvas records the context
// loss/restore listeners so the test can fire them like the browser does.

type Listener = (event: unknown) => void;

const createMockGl = () => {
  let textureId = 0;
  return {
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
  TEXTURE0: 33984,
  TEXTURE_2D: 3553,
  RGBA: 6408,
  UNSIGNED_BYTE: 5121,
  UNPACK_FLIP_Y_WEBGL: 37440,
  TEXTURE_WRAP_S: 10242,
  TEXTURE_WRAP_T: 10243,
  TEXTURE_MIN_FILTER: 10241,
  TEXTURE_MAG_FILTER: 10240,
  CLAMP_TO_EDGE: 33071,
  LINEAR: 9729,
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
  createTexture: vi.fn(() => ({ id: `texture-${(textureId += 1)}` })),
  deleteTexture: vi.fn(),
  activeTexture: vi.fn(),
  bindTexture: vi.fn(),
  pixelStorei: vi.fn(),
  texImage2D: vi.fn(),
  texParameteri: vi.fn(),
  getParameter: vi.fn(() => 8),
  bindFramebuffer: vi.fn(),
  viewport: vi.fn(),
  clear: vi.fn(),
  drawArrays: vi.fn()
  } as unknown as WebGLRenderingContext & {
    createTexture: ReturnType<typeof vi.fn>;
    deleteTexture: ReturnType<typeof vi.fn>;
    createProgram: ReturnType<typeof vi.fn>;
    createBuffer: ReturnType<typeof vi.fn>;
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
  private readonly listeners = new Map<string, Set<Listener>>();

  getContext(): unknown {
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

  addEventListener(type: string, cb: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(cb);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, cb: Listener): void {
    this.listeners.get(type)?.delete(cb);
  }

  remove(): void {}

  dispatch(type: string, event: unknown = {}): void {
    for (const cb of this.listeners.get(type) ?? []) cb(event);
  }
}

beforeEach(() => {
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
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("context loss and restore", () => {
  it("does not dispose pre-loss GL objects against the restored context", async () => {
    const canvas = new Canvas();
    const gl = canvas.gl;
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: "void main() { gl_FragColor = vec4(1.0); }"
    });
    await fx.ready;

    const programBefore = gl.createProgram.mock.results[0]?.value;
    const bufferBefore = gl.createBuffer.mock.results[0]?.value;
    expect(programBefore).toBeDefined();
    expect(bufferBefore).toBeDefined();

    const preventDefault = vi.fn();
    canvas.dispatch("webglcontextlost", { preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(fx.status).toBe("context-lost");

    canvas.dispatch("webglcontextrestored");
    await vi.waitFor(() => expect(fx.status).toBe("running"));

    expect(gl.deleteProgram).not.toHaveBeenCalled();
    expect(gl.deleteBuffer).not.toHaveBeenCalled();
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
  });

  it("does not delete pre-loss textures against the restored context", async () => {
    const canvas = new Canvas();
    const gl = canvas.gl;
    const source = new Canvas();
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: "void main() { gl_FragColor = vec4(1.0); }",
      textures: { image: source as unknown as HTMLCanvasElement }
    });
    await fx.ready;

    const textureBefore = gl.createTexture.mock.results[0]?.value;
    expect(textureBefore).toBeDefined();

    canvas.dispatch("webglcontextlost", { preventDefault: vi.fn() });
    canvas.dispatch("webglcontextrestored");
    await vi.waitFor(() => expect(fx.status).toBe("running"));

    expect(gl.deleteTexture).not.toHaveBeenCalledWith(textureBefore);
    expect(gl.createTexture).toHaveBeenCalledTimes(2);
  });
});
