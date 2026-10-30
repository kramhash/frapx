import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedTexture } from "../src/internal/textures";
import type { GLContext, TextureInput } from "../src/types";

// loadTexture decodes images; replace it with promises the tests settle.
const pending: Array<{
  name: string;
  unit: number;
  resolve: (texture: LoadedTexture) => void;
  reject: (error: Error) => void;
}> = [];

vi.mock("../src/internal/textures", () => ({
  loadTexture: (_gl: GLContext, name: string, _input: TextureInput, unit: number) =>
    new Promise<LoadedTexture>((resolve, reject) => {
      pending.push({ name, unit, resolve, reject });
    })
}));

const { createTextureSet } = await import("../src/internal/textureSet");

const loaded = (name: string, id: string): LoadedTexture => ({
  name,
  uniformName: `u_${name}`,
  sizeUniformName: `u_${name}Size`,
  texture: { id } as unknown as WebGLTexture,
  width: 1,
  height: 1
});

const createMockGl = (maxUnits = 4) =>
  ({
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    TEXTURE0: 33984,
    TEXTURE_2D: 3553,
    getParameter: vi.fn(() => maxUnits),
    deleteTexture: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    uniform1i: vi.fn()
  }) as unknown as GLContext & Record<string, ReturnType<typeof vi.fn>>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  pending.length = 0;
});

describe("createTextureSet", () => {
  it("hands out the lowest free unit and keeps it per name", () => {
    const gl = createMockGl();
    const set = createTextureSet();

    expect(set.reserveUnit(gl, "previousFrame")).toBe(0);
    expect(set.reserveUnit(gl, "image")).toBe(1);
    expect(set.reserveUnit(gl, "previousFrame")).toBe(0);
  });

  it("throws once every unit is taken", () => {
    const gl = createMockGl(1);
    const set = createTextureSet();
    set.reserveUnit(gl, "a");
    expect(() => set.reserveUnit(gl, "b")).toThrow("Texture unit limit exceeded");
  });

  it("loads every input and replaces the previous textures", async () => {
    const gl = createMockGl();
    const set = createTextureSet({ a: "a.png", b: "b.png" });
    expect(set.hasInput("a")).toBe(true);

    const first = set.loadAll(gl, () => false);
    pending.shift()!.resolve(loaded("a", "a1"));
    await flush();
    pending.shift()!.resolve(loaded("b", "b1"));
    await first;
    expect([...set.textures.keys()]).toEqual(["a", "b"]);

    const second = set.loadAll(gl, () => false);
    pending.shift()!.resolve(loaded("a", "a2"));
    await flush();
    pending.shift()!.resolve(loaded("b", "b2"));
    await second;
    expect(gl.deleteTexture).toHaveBeenCalledWith({ id: "a1" });
    expect(gl.deleteTexture).toHaveBeenCalledWith({ id: "b1" });
    expect(set.textures.get("a")!.texture).toEqual({ id: "a2" });
  });

  it("forgets the loaded textures without deleting them", async () => {
    const gl = createMockGl();
    const set = createTextureSet({ a: "a.png" });

    const first = set.loadAll(gl, () => false);
    pending.shift()!.resolve(loaded("a", "a1"));
    await first;
    expect(set.textures.size).toBe(1);

    set.forget();
    expect(set.textures.size).toBe(0);
    expect(set.hasInput("a")).toBe(true);
    expect(set.reserveUnit(gl, "a")).toBe(0);
    expect(gl.deleteTexture).not.toHaveBeenCalled();

    const second = set.loadAll(gl, () => false);
    pending.shift()!.resolve(loaded("a", "a2"));
    await second;
    expect(gl.deleteTexture).not.toHaveBeenCalledWith({ id: "a1" });
    expect(set.textures.get("a")!.texture).toEqual({ id: "a2" });
  });

  it("drops a load superseded by a later set() for the same name", async () => {
    const gl = createMockGl();
    const set = createTextureSet();

    const first = set.set(gl, "image", "old.png", () => false);
    const second = set.set(gl, "image", "new.png", () => false);
    const [older, newer] = [pending[0]!, pending[1]!];
    expect(older.unit).toBe(newer.unit);

    newer.resolve(loaded("image", "new"));
    expect(await second).not.toBeNull();
    older.resolve(loaded("image", "old"));
    expect(await first).toBeNull();

    expect(gl.deleteTexture).toHaveBeenCalledWith({ id: "old" });
    expect(set.textures.get("image")!.texture).toEqual({ id: "new" });
  });

  it("drops a load that finishes after cancellation", async () => {
    const gl = createMockGl();
    const set = createTextureSet();
    let cancelled = false;

    const result = set.set(gl, "image", "a.png", () => cancelled);
    cancelled = true;
    pending.shift()!.resolve(loaded("image", "late"));

    expect(await result).toBeNull();
    expect(set.textures.size).toBe(0);
    expect(gl.deleteTexture).toHaveBeenCalledWith({ id: "late" });
  });

  it("releases the unit of a name that failed to load and is otherwise unused", async () => {
    const gl = createMockGl();
    const set = createTextureSet();

    const failing = set.set(gl, "broken", "missing.png", () => false);
    pending.shift()!.reject(new Error("404"));
    await expect(failing).rejects.toThrow("404");

    expect(set.reserveUnit(gl, "next")).toBe(0);
  });

  it("binds loaded textures to their units and reports missing samplers", async () => {
    const gl = createMockGl();
    const set = createTextureSet();
    set.reserveUnit(gl, "previousFrame");
    const a = set.set(gl, "a", "a.png", () => false);
    pending.shift()!.resolve(loaded("a", "a"));
    await a;
    const b = set.set(gl, "b", "b.png", () => false);
    pending.shift()!.resolve(loaded("b", "b"));
    await b;

    const location = { id: "u_a" } as unknown as WebGLUniformLocation;
    const missing: string[] = [];
    set.bind(gl, new Map([["u_a", location]]), (name) => missing.push(name));

    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE0 + 1);
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, { id: "a" });
    expect(gl.uniform1i).toHaveBeenCalledWith(location, 1);
    expect(missing).toEqual(["u_b"]);
  });
});
