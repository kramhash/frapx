import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShaderBackground } from "../src";
import { normalizeFeedbackOptions } from "../src/internal/feedback";
import { TextureLoadError } from "../src/internal/errors";

const FRAGMENT = `precision highp float;
uniform sampler2D u_previousFrame;
uniform vec2 u_previousFrameSize;
void main() {
  vec2 uv = gl_FragCoord.xy / u_previousFrameSize;
  gl_FragColor = texture2D(u_previousFrame, uv) + vec4(0.1);
}`;

const createMockGl = (maxTextureUnits = 8) => {
  let programId = 0;
  let textureId = 0;
  let framebufferId = 0;
  let bufferId = 0;

  const uniforms = ["u_previousFrame", "u_previousFrameSize", "u_source"];
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
    FRAMEBUFFER_COMPLETE: 36053,
    COLOR_ATTACHMENT0: 36064,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    CLAMP_TO_EDGE: 33071,
    REPEAT: 10497,
    MIRRORED_REPEAT: 33648,
    LINEAR: 9729,
    NEAREST: 9728,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    createShader: vi.fn(() => ({ id: "shader" })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    createProgram: vi.fn(() => ({ id: `program-${programId++}` })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program: unknown, parameter: number) =>
      parameter === 35718 ? uniforms.length : true
    ),
    getProgramInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({ id: `buffer-${bufferId++}` })),
    deleteBuffer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getActiveUniform: vi.fn((_program: unknown, index: number) => {
      const name = uniforms[index];
      return name ? { name } : null;
    }),
    getUniformLocation: vi.fn((_program: unknown, name: string) => ({
      name
    })),
    getParameter: vi.fn((parameter: number) =>
      parameter === 34930 ? maxTextureUnits : 0
    ),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform4f: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    uniform1i: vi.fn(),
    activeTexture: vi.fn(),
    createTexture: vi.fn(() => ({ id: `texture-${textureId++}` })),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    createFramebuffer: vi.fn(() => ({ id: `framebuffer-${framebufferId++}` })),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 36053),
    clearColor: vi.fn(),
    viewport: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn()
  };

  return gl;
};

class Canvas {
  width = 32;
  height = 16;
  clientWidth = 32;
  clientHeight = 16;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = { add: vi.fn() };

  constructor(readonly gl = createMockGl()) {}

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

  addEventListener(): void {}
  removeEventListener(): void {}
  remove(): void {}
}

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
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}

beforeEach(() => {
  stubBrowserGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("feedback option validation", () => {
  it("normalizes the default previous-frame uniforms", () => {
    expect(normalizeFeedbackOptions(true)).toMatchObject({
      uniform: "previousFrame",
      uniformName: "u_previousFrame",
      sizeUniformName: "u_previousFrameSize",
      filter: "linear",
      wrap: "clamp",
      clearColor: [0, 0, 0, 0]
    });
  });

  it("rejects prefixed or invalid uniform suffixes", () => {
    expect(() => normalizeFeedbackOptions({ uniform: "u_previousFrame" })).toThrow(
      TextureLoadError
    );
    expect(() => normalizeFeedbackOptions({ uniform: "previous-frame" })).toThrow(
      TextureLoadError
    );
  });
});

describe("feedback rendering", () => {
  it("renders the main shader to a feedback framebuffer, copies to canvas, then swaps", async () => {
    const gl = createMockGl();
    const canvas = new Canvas(gl);
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: FRAGMENT,
      feedback: true
    });

    await fx.ready;
    fx.render();

    expect(gl.createFramebuffer).toHaveBeenCalledTimes(2);
    expect(gl.framebufferTexture2D).toHaveBeenCalledTimes(2);
    expect(gl.uniform1i).toHaveBeenCalledWith({ name: "u_previousFrame" }, 0);
    expect(gl.uniform1i).toHaveBeenCalledWith({ name: "u_source" }, 0);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null);
  });

  it("recreates feedback targets after a canvas resize", async () => {
    const gl = createMockGl();
    const canvas = new Canvas(gl);
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: FRAGMENT,
      feedback: true
    });

    await fx.ready;
    canvas.clientWidth = 64;
    canvas.clientHeight = 32;
    fx.render();

    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(4);
  });

  it("rejects texture names that conflict with the feedback uniform", async () => {
    const gl = createMockGl();
    const canvas = new Canvas(gl);
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: FRAGMENT,
      feedback: true,
      textures: {
        previousFrame: canvas as unknown as HTMLCanvasElement
      }
    });

    await expect(fx.ready).rejects.toThrow(TextureLoadError);
    expect(fx.status).toBe("error");
  });

  it("rejects runtime texture updates that conflict with the feedback uniform", async () => {
    const gl = createMockGl();
    const canvas = new Canvas(gl);
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: FRAGMENT,
      feedback: true
    });

    await fx.ready;
    await expect(
      fx.setTexture("previousFrame", canvas as unknown as HTMLCanvasElement)
    ).rejects.toThrow(TextureLoadError);
  });

  it("fails initialization when feedback plus textures exceed texture units", async () => {
    const gl = createMockGl(1);
    const canvas = new Canvas(gl);
    const fx = createShaderBackground({
      canvas: canvas as unknown as HTMLCanvasElement,
      fragment: FRAGMENT,
      feedback: true,
      textures: {
        image: canvas as unknown as HTMLCanvasElement
      }
    });

    await expect(fx.ready).rejects.toThrow(TextureLoadError);
    expect(fx.status).toBe("error");
  });
});
