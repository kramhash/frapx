import { describe, expect, it, vi } from "vitest";
import { createShaderBackground } from "../src";
import { loadTexture } from "../src/internal/textures";

const createMockGl = () => {
  let textureId = 0;
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ACTIVE_UNIFORMS: 35718,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    TEXTURE0: 1000,
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
    getProgramParameter: vi.fn((_program: WebGLProgram, parameter: number) =>
      parameter === 35718 ? 2 : true
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
    getActiveUniform: vi.fn((_program: WebGLProgram, index: number) =>
      index === 0 ? { name: "u_image" } : { name: "u_imageSize" }
    ),
    getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => ({
      name
    })),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform1i: vi.fn(),
    getParameter: vi.fn((parameter: number) =>
      parameter === 34930 ? 8 : undefined
    ),
    createTexture: vi.fn(() => {
      textureId += 1;
      return { id: `texture-${textureId}` };
    }),
    deleteTexture: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn()
  } as unknown as WebGLRenderingContext & {
    createTexture: ReturnType<typeof vi.fn>;
    activeTexture: ReturnType<typeof vi.fn>;
    deleteTexture: ReturnType<typeof vi.fn>;
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
  private readonly gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext = createMockGl()) {
    this.gl = gl;
  }

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

const stubBrowserGlobals = () => {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
  vi.stubGlobal("HTMLImageElement", class {});
  vi.stubGlobal("HTMLCanvasElement", Canvas);
};

describe("loadTexture", () => {
  it("loads a canvas texture with the requested texture unit", async () => {
    stubBrowserGlobals();

    const gl = createMockGl();
    const source = new Canvas(gl) as unknown as HTMLCanvasElement;

    const texture = await loadTexture(gl, "image", source, 3);

    expect(texture).toMatchObject({
      name: "image",
      uniformName: "u_image",
      sizeUniformName: "u_imageSize",
      width: 32,
      height: 16
    });
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE0 + 3);

    vi.unstubAllGlobals();
  });

  it("updates runtime textures without changing the assigned texture unit", async () => {
    stubBrowserGlobals();

    const gl = createMockGl();
    const canvas = new Canvas(gl) as unknown as HTMLCanvasElement;
    const fx = createShaderBackground({
      canvas,
      fragment: "void main() { gl_FragColor = vec4(1.0); }",
      autoResize: false,
      autoStart: false,
      pauseWhenOffscreen: false,
      textures: {
        image: new Canvas(gl) as unknown as HTMLCanvasElement
      }
    });

    await fx.ready;
    const firstTexture = fx.gl;
    await fx.setTexture("image", new Canvas(gl) as unknown as HTMLCanvasElement);

    expect(firstTexture).toBe(gl);
    expect(gl.activeTexture).toHaveBeenLastCalledWith(gl.TEXTURE0);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);

    fx.destroy();
    vi.unstubAllGlobals();
  });
});
