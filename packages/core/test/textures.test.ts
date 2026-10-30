import { describe, expect, it, vi } from "vitest";
import { TextureLoadError } from "../src/internal/errors";
import { getTextureSizeUniform, loadTexture } from "../src/internal/textures";
import { createTextureSet } from "../src/internal/textureSet";
import type { DataTextureOptions, GLContext } from "../src/types";

const createMockGl2 = ({ floatLinear = true } = {}) =>
  ({
    TEXTURE0: 33984,
    TEXTURE_2D: 3553,
    TEXTURE_3D: 32879,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    UNPACK_FLIP_Y_WEBGL: 37440,
    UNPACK_ALIGNMENT: 3317,
    RED: 6403,
    R8: 33321,
    R16F: 33325,
    R32F: 33326,
    UNSIGNED_BYTE: 5121,
    HALF_FLOAT: 5131,
    FLOAT: 5126,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_WRAP_R: 32882,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    CLAMP_TO_EDGE: 33071,
    REPEAT: 10497,
    MIRRORED_REPEAT: 33648,
    NEAREST: 9728,
    LINEAR: 9729,
    createVertexArray: vi.fn(),
    getExtension: vi.fn((name: string) =>
      name === "OES_texture_float_linear" && floatLinear ? {} : null
    ),
    getParameter: vi.fn(() => 8),
    createTexture: vi.fn(() => ({ id: "texture" })),
    deleteTexture: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage3D: vi.fn(),
    texParameteri: vi.fn(),
    uniform1i: vi.fn()
  }) as unknown as WebGL2RenderingContext & Record<string, ReturnType<typeof vi.fn>>;

const volume = (overrides: Partial<DataTextureOptions> = {}): DataTextureOptions => ({
  data: new Uint16Array(4 * 3 * 2),
  size: [4, 3, 2],
  format: "r16f",
  ...overrides
});

describe("loadTexture with data", () => {
  it.each([
    ["r8", new Uint8Array(24), 33321, 5121],
    ["r16f", new Uint16Array(24), 33325, 5131],
    ["r32f", new Float32Array(24), 33326, 5126]
  ] as const)("uploads %s as a single-channel 3D texture", async (format, data, internal, type) => {
    const gl = createMockGl2();
    const texture = await loadTexture(gl, "volume", { data, size: [4, 3, 2], format }, 2);

    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE0 + 2);
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_3D, { id: "texture" });
    expect(gl.texImage3D).toHaveBeenCalledWith(
      gl.TEXTURE_3D, 0, internal, 4, 3, 2, 0, gl.RED, type, data
    );
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, false);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_ALIGNMENT, 1);
    expect(gl.pixelStorei).toHaveBeenLastCalledWith(gl.UNPACK_ALIGNMENT, 4);
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    expect(texture).toMatchObject({
      uniformName: "u_volume",
      sizeUniformName: "u_volumeSize",
      target: gl.TEXTURE_3D,
      width: 4,
      height: 3,
      depth: 2
    });
  });

  it("applies wrap and filter", async () => {
    const gl = createMockGl2();
    await loadTexture(gl, "volume", volume({ wrap: "repeat", filter: "nearest" }), 0);

    for (const pname of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_3D, pname, gl.REPEAT);
    }
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  });

  it("rejects a WebGL1 context", async () => {
    const gl = createMockGl2() as unknown as Record<string, unknown>;
    delete gl.createVertexArray;

    await expect(loadTexture(gl as unknown as GLContext, "volume", volume(), 0)).rejects.toThrow(
      new TextureLoadError("3D textures need WebGL2: volume")
    );
  });

  it("rejects an array type that does not match the format", async () => {
    const gl = createMockGl2();
    await expect(
      loadTexture(gl, "volume", volume({ data: new Float32Array(24) }), 0)
    ).rejects.toThrow('Data texture format "r16f" needs a Uint16Array: volume');
    expect(gl.createTexture).not.toHaveBeenCalled();
  });

  it("rejects a length that does not match the size", async () => {
    const gl = createMockGl2();
    await expect(
      loadTexture(gl, "volume", volume({ data: new Uint16Array(23) }), 0)
    ).rejects.toThrow("Data texture has 23 values, size [4, 3, 2] needs 24: volume");
  });

  it("rejects a size that is not three positive integers", async () => {
    const gl = createMockGl2();
    await expect(
      loadTexture(gl, "volume", volume({ size: [4, 3, 0] }), 0)
    ).rejects.toThrow("Data texture size must be three positive integers");
  });

  it("samples r32f with nearest filtering and warns without OES_texture_float_linear", async () => {
    const gl = createMockGl2({ floatLinear: false });
    const warn = vi.fn();
    await loadTexture(gl, "volume", { data: new Float32Array(24), size: [4, 3, 2], format: "r32f" }, 0, warn);

    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("OES_texture_float_linear"));
  });

  it("keeps linear filtering for r16f without the float linear extension", async () => {
    const gl = createMockGl2({ floatLinear: false });
    const warn = vi.fn();
    await loadTexture(gl, "volume", volume(), 0, warn);

    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("getTextureSizeUniform", () => {
  it("is a vec3 for 3D textures and a vec2 for 2D ones", async () => {
    const gl = createMockGl2();
    const texture = await loadTexture(gl, "volume", volume(), 0);

    expect(getTextureSizeUniform(texture)).toEqual({ type: "vec3", value: [4, 3, 2] });
    expect(getTextureSizeUniform({ ...texture, depth: null })).toEqual({
      type: "vec2",
      value: [4, 3]
    });
  });
});

describe("createTextureSet with data textures", () => {
  it("binds a data texture to TEXTURE_3D and passes warnings on", async () => {
    const gl = createMockGl2({ floatLinear: false });
    const warn = vi.fn();
    const set = createTextureSet(
      { volume: { data: new Float32Array(24), size: [4, 3, 2], format: "r32f" } },
      { warn }
    );

    await set.loadAll(gl, () => false);
    gl.bindTexture.mockClear();
    set.bind(gl, new Map([["u_volume", { name: "u_volume" }]]));

    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_3D, { id: "texture" });
    expect(gl.uniform1i).toHaveBeenCalledWith({ name: "u_volume" }, 0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("re-uploads the kept data on loadAll, as after a context restore", async () => {
    const gl = createMockGl2();
    const data = new Uint16Array(24);
    const set = createTextureSet({ volume: volume({ data }) });

    await set.loadAll(gl, () => false);
    await set.loadAll(gl, () => false);

    expect(gl.texImage3D).toHaveBeenCalledTimes(2);
    expect(gl.texImage3D.mock.calls[1]![9]).toBe(data);
  });
});
