import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShaderBackground } from "../src";
import { isGLSL300 } from "../src/internal/webgl";
import { UnsupportedError } from "../src/internal/errors";

// --- Minimal WebGL mock -------------------------------------------------------

const createMockGl = () => ({
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
});

type SupportMode = "both" | "webgl-only" | "none";

class Canvas {
  width = 32;
  height = 16;
  clientWidth = 32;
  clientHeight = 16;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = { add: vi.fn() };
  readonly getContextSpy = vi.fn();
  private readonly gl1 = createMockGl();
  private readonly gl2 = createMockGl();

  constructor(supportMode: SupportMode = "both") {
    this.getContextSpy.mockImplementation((id: string) => {
      if (id === "webgl2") return supportMode === "both" ? this.gl2 : null;
      if (id === "webgl") return supportMode !== "none" ? this.gl1 : null;
      return null;
    });
  }

  getContext(id: string): unknown {
    return this.getContextSpy(id);
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

const FRAGMENT_100 = `precision highp float;
uniform float u_time;
void main() { gl_FragColor = vec4(1.0); }`;

const FRAGMENT_300 = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform float u_time;
void main() { fragColor = vec4(1.0); }`;

const FRAGMENT_300_WITH_LEADING_NEWLINE = `
#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }`;

function stubBrowserGlobals(): void {
  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    matchMedia: () => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  });
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: unknown[]) => void) {
        cb([{ isIntersecting: true }]);
      }
      observe(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  vi.stubGlobal("HTMLImageElement", class {});
  vi.stubGlobal("HTMLCanvasElement", Canvas);
  vi.stubGlobal("requestAnimationFrame", (_cb: unknown) => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}

beforeEach(() => {
  stubBrowserGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Convenience factory — always passes an explicit canvas so dom.ts never
// calls document.createElement (which is not stubbed in the test harness).
function create(
  fragment: string,
  supportMode: SupportMode = "both",
  overrides: Partial<Parameters<typeof createShaderBackground>[0]> = {}
) {
  const canvas = new Canvas(supportMode);
  const fx = createShaderBackground({
    canvas: canvas as unknown as HTMLCanvasElement,
    fragment,
    ...overrides
  });
  return { fx, canvas };
}

// --- isGLSL300 detection -----------------------------------------------------

describe("isGLSL300", () => {
  it("detects #version 300 es at start", () => {
    expect(isGLSL300("#version 300 es\n...")).toBe(true);
  });

  it("detects with leading whitespace/newline", () => {
    expect(isGLSL300("\n#version 300 es\n...")).toBe(true);
    expect(isGLSL300("  #version 300 es\n...")).toBe(true);
  });

  it("ignores #version 100", () => {
    expect(isGLSL300("#version 100\n...")).toBe(false);
  });

  it("ignores no-version shader", () => {
    expect(isGLSL300(FRAGMENT_100)).toBe(false);
  });

  it("ignores #version 300 es embedded in the middle", () => {
    expect(isGLSL300("// comment\n#version 300 es\n...")).toBe(false);
  });
});

// --- WebGL2 context selection ------------------------------------------------

describe("WebGL2 context selection", () => {
  it("requests webgl2 context when fragment starts with #version 300 es", async () => {
    const { canvas } = create(FRAGMENT_300);
    await new Promise((r) => setTimeout(r, 20));
    expect(canvas.getContextSpy.mock.calls[0]?.[0]).toBe("webgl2");
  });

  it("requests webgl context when fragment has no #version directive", async () => {
    const { canvas } = create(FRAGMENT_100);
    await new Promise((r) => setTimeout(r, 20));
    expect(canvas.getContextSpy.mock.calls[0]?.[0]).toBe("webgl");
  });

  it("detects #version 300 es with leading newline (glsl tag artifact)", async () => {
    const { canvas } = create(FRAGMENT_300_WITH_LEADING_NEWLINE);
    await new Promise((r) => setTimeout(r, 20));
    expect(canvas.getContextSpy.mock.calls[0]?.[0]).toBe("webgl2");
  });
});

// --- Unsupported WebGL2 ------------------------------------------------------

describe("WebGL2 unsupported", () => {
  it("sets status to unsupported and fires onError with UnsupportedError when webgl2 is unavailable", async () => {
    const errors: Error[] = [];
    const { fx } = create(FRAGMENT_300, "webgl-only", {
      onError: (e) => errors.push(e)
    });
    await fx.ready.catch(() => {});

    expect(fx.status).toBe("unsupported");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(UnsupportedError);
    expect(errors[0]?.message).toMatch(/WebGL2/);
  });
});

// --- WebGL1 regression -------------------------------------------------------

describe("WebGL1 regression", () => {
  it("still reaches ready/running status with a 1.00 fragment shader", async () => {
    const { fx } = create(FRAGMENT_100);
    await fx.ready;
    expect(["ready", "running"]).toContain(fx.status);
  });
});
