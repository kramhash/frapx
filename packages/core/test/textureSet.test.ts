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
  target: 3553,
  width: 1,
  height: 1,
  depth: null
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

const idOf = (texture: unknown) => (texture as { id: string }).id;

// Every texture created is either still held by the set or deleted, once.
const expectNoLeaks = (
  gl: ReturnType<typeof createMockGl>,
  set: { textures: ReadonlyMap<string, LoadedTexture> },
  created: readonly string[]
) => {
  const live = [...set.textures.values()].map((texture) => idOf(texture.texture));
  const deleted = gl.deleteTexture.mock.calls.map(([texture]) => idOf(texture));
  expect([...live, ...deleted].sort()).toEqual([...created].sort());
};

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

  it("deletes textures that finish loading after a cancellation (#117)", async () => {
    const gl = createMockGl();
    const set = createTextureSet({ a: "a.png", b: "b.png" });
    let cancelled = false;

    const loading = set.loadAll(gl, () => cancelled);
    pending.shift()!.resolve(loaded("a", "a1"));
    await flush();
    // The runtime is destroyed (and the set disposed) while b is in flight.
    cancelled = true;
    set.dispose(gl);
    pending.shift()!.resolve(loaded("b", "b1"));
    await loading;

    expect(gl.deleteTexture).toHaveBeenCalledWith({ id: "a1" });
    expect(gl.deleteTexture).toHaveBeenCalledWith({ id: "b1" });
    expect(set.textures.size).toBe(0);
  });

  it("deletes what it loaded when a later load fails", async () => {
    const gl = createMockGl();
    const set = createTextureSet({ a: "a.png", b: "b.png" });

    const loading = set.loadAll(gl, () => false);
    pending.shift()!.resolve(loaded("a", "a1"));
    await flush();
    pending.shift()!.reject(new Error("b failed"));

    await expect(loading).rejects.toThrow("b failed");
    expect(gl.deleteTexture).toHaveBeenCalledWith({ id: "a1" });
    expect(set.textures.size).toBe(0);
  });

  it("keeps a set() made during loadAll for an initial name (#122)", async () => {
    const gl = createMockGl();
    const set = createTextureSet({ a: "a.png" });

    const loading = set.loadAll(gl, () => false);
    const replacing = set.set(gl, "a", "replacement.png", () => false);
    const [initial, replacement] = [pending[0]!, pending[1]!];
    replacement.resolve(loaded("a", "replacement"));
    expect(await replacing).not.toBeNull();
    initial.resolve(loaded("a", "initial"));
    await loading;

    expect(set.textures.get("a")!.texture).toEqual({ id: "replacement" });
    expect(gl.deleteTexture).toHaveBeenCalledWith({ id: "initial" });
    expectNoLeaks(gl, set, ["initial", "replacement"]);
  });

  it("keeps a set() made during loadAll for a new name (#122)", async () => {
    const gl = createMockGl();
    const set = createTextureSet({ a: "a.png" });
    const created = ["a1", "b"];

    const loading = set.loadAll(gl, () => false);
    const adding = set.set(gl, "b", "b.png", () => false);
    const [initial, added] = [pending[0]!, pending[1]!];
    added.resolve(loaded("b", "b"));
    expect(await adding).not.toBeNull();
    initial.resolve(loaded("a", "a1"));
    // loadAll must not pick up the name set() added; settle any such load
    // so a regression fails the assertions below instead of hanging.
    await flush();
    for (const extra of pending.splice(2)) {
      created.push(`${extra.name}-reloaded`);
      extra.resolve(loaded(extra.name, `${extra.name}-reloaded`));
    }
    await loading;

    expect([...set.textures.keys()].sort()).toEqual(["a", "b"]);
    expect(set.textures.get("b")!.texture).toEqual({ id: "b" });
    expectNoLeaks(gl, set, created);
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
