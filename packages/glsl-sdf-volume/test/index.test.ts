import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { DataTextureOptions } from "@frapx/fx-canvas";
import { loadSdfVolume, sdfVolume, type SdfVolumeTexture } from "../src";
import { buildKtx2, bytesOf, defaultMeta } from "./buildKtx2";

const voxels = 4 * 4 * 4;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadSdfVolume", () => {
  it.each([
    [9, "r8", new Uint8Array(voxels).map((_, i) => i)],
    [76, "r16f", new Uint16Array(voxels).map((_, i) => 0x3c00 + i)],
    [100, "r32f", new Float32Array(voxels).map((_, i) => i / 8)]
  ] as const)("reads vkFormat %i as %s", async (vkFormat, format, values) => {
    const volume = await loadSdfVolume(buildKtx2({ vkFormat, level: bytesOf(values) }));

    expect(volume.texture).toEqual({
      data: values,
      size: [4, 4, 4],
      format,
      filter: "linear",
      wrap: "clamp"
    });
    expect(volume.texture.data.constructor).toBe(values.constructor);
  });

  it("returns the decode uniforms under a name", async () => {
    const meta = { ...defaultMeta, decode: { scale: 0.25, offset: -0.125 } };
    const volume = await loadSdfVolume(
      buildKtx2({ vkFormat: 9, level: new Uint8Array(voxels), meta })
    );

    expect(volume.uniforms()).toEqual({
      sdfMin: [-1, -1, -1],
      sdfMax: [1, 1, 1],
      sdfScale: 0.25,
      sdfOffset: -0.125
    });
    expect(volume.uniforms("logo")).toEqual({
      logoMin: [-1, -1, -1],
      logoMax: [1, 1, 1],
      logoScale: 0.25,
      logoOffset: -0.125
    });
  });

  it("keeps the metadata, including fields it does not read", async () => {
    const volume = await loadSdfVolume(buildKtx2({ level: new Uint8Array(voxels * 2) }));
    expect(volume.meta).toEqual(defaultMeta);
  });

  it("copies level 0 so the data starts aligned", async () => {
    // Level 0 is a view into the file; the texture data must own its buffer.
    const values = new Float32Array(voxels).fill(1.5);
    const volume = await loadSdfVolume(buildKtx2({ vkFormat: 100, level: bytesOf(values) }));
    expect(volume.texture.data.byteOffset).toBe(0);
    expect(volume.texture.data.buffer.byteLength).toBe(voxels * 4);
  });

  it("fetches a URL with the signal", async () => {
    const body = buildKtx2({ level: new Uint8Array(voxels * 2) });
    const fetchMock = vi.fn(async () => new Response(body));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await loadSdfVolume("/suzanne.sdf.ktx2", { signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledWith("/suzanne.sdf.ktx2", { signal: controller.signal });
  });

  it("fails on an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(loadSdfVolume("/missing.sdf.ktx2")).rejects.toThrow(
      "/missing.sdf.ktx2: HTTP 404"
    );
  });

  describe("errors name the field", () => {
    const level = new Uint8Array(voxels * 2);

    it.each([
      ["identifier", { identifier: new Array(12).fill(0) }, "Not a KTX 2.0 file"],
      ["vkFormat", { vkFormat: 37 }, "vkFormat 37 is not supported"],
      ["pixelDepth", { size: [4, 4, 0] as const }, "pixelDepth is 0"],
      ["supercompressionScheme", { scheme: 1 }, "supercompressionScheme 1 is not supported"],
      ["3dsdf.meta", { meta: null }, "the 3dsdf.meta key/value is missing"],
      ["version", { meta: { ...defaultMeta, version: 2 } }, "3dsdf.meta version 2 is not supported"],
      ["bboxMin", { meta: { ...defaultMeta, bboxMin: [0, 0] } }, "bboxMin must be three numbers"],
      ["decode", { meta: { ...defaultMeta, decode: { scale: 1 } } }, "decode must be { scale, offset }"],
      ["level length", { size: [4, 4, 5] as const }, "level 0 has 128 bytes"]
    ])("%s", async (_field, options, message) => {
      await expect(loadSdfVolume(buildKtx2({ level, ...options }))).rejects.toThrow(message);
    });
  });

  describe("Zstandard (supercompressionScheme 2)", () => {
    const raw = new Uint8Array(voxels).map((_, i) => 255 - i);
    // Stand-in for a zstd frame: the decoder below reverses it.
    const compressed = raw.slice().reverse();
    const zstd = (bytes: Uint8Array, size: number) => {
      expect(size).toBe(voxels);
      return bytes.slice().reverse();
    };

    it("reads through the given decoder to the same data as the uncompressed twin", async () => {
      const plain = await loadSdfVolume(buildKtx2({ vkFormat: 9, level: raw }));
      const packed = await loadSdfVolume(
        buildKtx2({ vkFormat: 9, scheme: 2, level: compressed, uncompressedByteLength: voxels }),
        { zstd }
      );
      expect(packed.texture).toEqual(plain.texture);
    });

    it("fails naming the zstd option without a decoder", async () => {
      await expect(
        loadSdfVolume(buildKtx2({ vkFormat: 9, scheme: 2, level: compressed }))
      ).rejects.toThrow("pass a decoder as the `zstd` option");
    });

    it("fails naming zstd when the decoder returns the wrong length", async () => {
      await expect(
        loadSdfVolume(buildKtx2({ vkFormat: 9, scheme: 2, level: compressed }), {
          zstd: (bytes) => bytes.subarray(1)
        })
      ).rejects.toThrow("the `zstd` decoder returned 63 bytes, expected uncompressedByteLength 64");
    });
  });
});

describe("types", () => {
  it("the texture is an fx-canvas data texture input", () => {
    expectTypeOf<SdfVolumeTexture>().toMatchTypeOf<DataTextureOptions>();
  });
});

describe("sdfVolume", () => {
  it("declares both functions with frapx_ names", () => {
    expect(sdfVolume).toContain("float frapx_sdVolume(highp sampler3D tex");
    expect(sdfVolume).toContain("vec3 frapx_sdVolumeGrad(highp sampler3D tex");
  });
});
