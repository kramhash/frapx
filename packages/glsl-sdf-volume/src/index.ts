// Baked 3D signed distance fields for frapx shaders: a loader for the
// `.sdf.ktx2` files the Blender extension 3dsdf-texture writes, and the
// GLSL ES 3.00 (WebGL2) functions that sample them.
// The format is defined in 3dsdf-texture's docs/format.md (version 1).

import { readKtx2 } from "./ktx2";

const glsl = String.raw;

/**
 * `frapx_sdVolume` and `frapx_sdVolumeGrad`. GLSL ES 3.00 required: declare
 * the volume as `uniform highp sampler3D u_<name>;` in a `#version 300 es`
 * shader.
 *
 * `frapx_sdVolume(tex, p, bmin, bmax, scale, offset)` is the distance at `p`
 * in the volume's own coordinates. Inside the box it is the sampled value
 * `v * scale + offset`. Outside, with `b` the distance to the box and `e` the
 * value at the nearest point on it, it is `max(b, e - b)`: both terms are
 * lower bounds of the true distance (the shape lies inside the box, and a
 * distance changes by at most `b` over `b`), so sphere tracing from outside
 * never steps through the surface.
 *
 * `frapx_sdVolumeGrad` is the gradient from central differences one voxel
 * apart; normalize it for a surface normal.
 *
 * To place the shape, transform `p` into volume space before the call and
 * multiply the result by the scale you applied.
 */
export const sdfVolume = glsl`
float frapx_sdVolume(highp sampler3D tex, vec3 p, vec3 bmin, vec3 bmax, float scale, float offset) {
  vec3 q = clamp(p, bmin, bmax);
  float e = texture(tex, (q - bmin) / (bmax - bmin)).r * scale + offset;
  float b = length(p - q);
  return b > 0.0 ? max(b, e - b) : e;
}

vec3 frapx_sdVolumeGrad(highp sampler3D tex, vec3 p, vec3 bmin, vec3 bmax, float scale, float offset) {
  vec3 h = (bmax - bmin) / vec3(textureSize(tex, 0));
  vec3 dx = vec3(h.x, 0.0, 0.0);
  vec3 dy = vec3(0.0, h.y, 0.0);
  vec3 dz = vec3(0.0, 0.0, h.z);
  return vec3(
    frapx_sdVolume(tex, p + dx, bmin, bmax, scale, offset) - frapx_sdVolume(tex, p - dx, bmin, bmax, scale, offset),
    frapx_sdVolume(tex, p + dy, bmin, bmax, scale, offset) - frapx_sdVolume(tex, p - dy, bmin, bmax, scale, offset),
    frapx_sdVolume(tex, p + dz, bmin, bmax, scale, offset) - frapx_sdVolume(tex, p - dz, bmin, bmax, scale, offset)
  ) / (2.0 * h);
}
`;

export type SdfVolumeFormat = "r8" | "r16f" | "r32f";

export type Vec3 = readonly [number, number, number];

/**
 * The `3dsdf.meta` key/value of the file. Fields frapx does not read (such as
 * `units`, `axis`, `sign`, `source`) are kept as they are.
 */
export type SdfVolumeMeta = {
  version: 1;
  /** Outer faces of the voxel grid, in the source object's local units. */
  bboxMin: Vec3;
  bboxMax: Vec3;
  voxelSize: number;
  /** Distance = sampled value * scale + offset. */
  decode: { scale: number; offset: number };
  [field: string]: unknown;
};

/**
 * A 3D data texture input for `@frapx/fx-canvas` / `@frapx/fx-passes`
 * `textures` (their `DataTextureOptions`).
 */
export type SdfVolumeTexture = {
  data: Uint8Array | Uint16Array | Float32Array;
  size: Vec3;
  format: SdfVolumeFormat;
  filter: "linear";
  wrap: "clamp";
};

export type SdfVolumeUniforms<N extends string> = {
  [K in `${N}Min` | `${N}Max`]: Vec3;
} & {
  [K in `${N}Scale` | `${N}Offset`]: number;
};

export type SdfVolume = {
  texture: SdfVolumeTexture;
  /**
   * The values `frapx_sdVolume` needs after the texture, keyed for
   * `uniforms`: `uniforms("sdf")` gives `sdfMin`, `sdfMax` (vec3) and
   * `sdfScale`, `sdfOffset` (float), declared as `u_sdfMin` and so on.
   */
  uniforms<N extends string = "sdf">(name?: N): SdfVolumeUniforms<N>;
  meta: SdfVolumeMeta;
};

/** Decompresses one zstd frame into `size` bytes, e.g. fzstd's `decompress`. */
export type ZstdDecoder = (bytes: Uint8Array, size: number) => Uint8Array;

export type LoadSdfVolumeOptions = {
  /** Aborts the fetch of a URL source. */
  signal?: AbortSignal;
  /**
   * Needed only for files written with Zstd compression
   * (`supercompressionScheme` 2). frapx bundles no decoder.
   */
  zstd?: ZstdDecoder;
};

const META_KEY = "3dsdf.meta";

const VK_FORMATS: Record<number, SdfVolumeFormat> = {
  9: "r8", // R8_UNORM
  76: "r16f", // R16_SFLOAT
  100: "r32f" // R32_SFLOAT
};

/**
 * Reads a `.sdf.ktx2` file from a URL (fetched) or from its bytes. Fails
 * with an error naming the field when the file is not one this version
 * reads.
 */
export const loadSdfVolume = async (
  source: string | URL | ArrayBuffer,
  options: LoadSdfVolumeOptions = {}
): Promise<SdfVolume> => {
  if (source instanceof ArrayBuffer) {
    return parseSdfVolume(new Uint8Array(source), "SDF volume", options);
  }

  const url = String(source);
  const response = await fetch(url, options.signal ? { signal: options.signal } : {});
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return parseSdfVolume(new Uint8Array(await response.arrayBuffer()), url, options);
};

const parseSdfVolume = (
  bytes: Uint8Array,
  label: string,
  options: LoadSdfVolumeOptions
): SdfVolume => {
  let file;
  try {
    file = readKtx2(bytes);
  } catch (error) {
    throw new Error(`${label}: ${(error as Error).message}`);
  }

  const format = VK_FORMATS[file.vkFormat];
  if (!format) {
    throw new Error(
      `${label}: vkFormat ${file.vkFormat} is not supported (9 R8_UNORM, 76 R16_SFLOAT or 100 R32_SFLOAT).`
    );
  }
  if (file.pixelDepth === 0) {
    throw new Error(`${label}: pixelDepth is 0, so this is not a 3D texture.`);
  }
  const scheme = file.supercompressionScheme;
  if (scheme !== 0 && scheme !== 2) {
    throw new Error(
      `${label}: supercompressionScheme ${scheme} is not supported (0 or 2 Zstandard).`
    );
  }
  const metaBytes = file.keyValue.get(META_KEY);
  if (!metaBytes) {
    throw new Error(`${label}: the ${META_KEY} key/value is missing.`);
  }
  const meta = parseMeta(new TextDecoder().decode(metaBytes), label);

  const level = file.levels[0]!;
  let data = level.data;
  if (scheme === 2) {
    if (!options.zstd) {
      throw new Error(
        `${label}: the file is Zstandard-compressed (supercompressionScheme 2); pass a decoder as the \`zstd\` option.`
      );
    }
    data = options.zstd(data, level.uncompressedByteLength);
    if (data.byteLength !== level.uncompressedByteLength) {
      throw new Error(
        `${label}: the \`zstd\` decoder returned ${data.byteLength} bytes, expected uncompressedByteLength ${level.uncompressedByteLength}.`
      );
    }
  }

  const size: Vec3 = [file.pixelWidth, file.pixelHeight, file.pixelDepth];
  const voxels = size[0] * size[1] * size[2];
  const bytesPerVoxel = format === "r8" ? 1 : format === "r16f" ? 2 : 4;
  if (data.byteLength !== voxels * bytesPerVoxel) {
    throw new Error(
      `${label}: level 0 has ${data.byteLength} bytes, size [${size.join(", ")}] in ${format} needs ${voxels * bytesPerVoxel}.`
    );
  }

  // Copy out of the file so the typed array starts on an aligned offset and
  // does not keep the whole file alive.
  const copy = data.slice();
  const values =
    format === "r8"
      ? copy
      : format === "r16f"
        ? new Uint16Array(copy.buffer)
        : new Float32Array(copy.buffer);

  return {
    texture: { data: values, size, format, filter: "linear", wrap: "clamp" },
    uniforms: <N extends string = "sdf">(name: N = "sdf" as N) =>
      ({
        [`${name}Min`]: meta.bboxMin,
        [`${name}Max`]: meta.bboxMax,
        [`${name}Scale`]: meta.decode.scale,
        [`${name}Offset`]: meta.decode.offset
      }) as SdfVolumeUniforms<N>,
    meta
  };
};

const parseMeta = (text: string, label: string): SdfVolumeMeta => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${label}: ${META_KEY} is not valid JSON.`);
  }
  if (!isRecord(raw)) {
    throw new Error(`${label}: ${META_KEY} is not a JSON object.`);
  }
  if (raw.version !== 1) {
    throw new Error(`${label}: ${META_KEY} version ${String(raw.version)} is not supported (1).`);
  }
  const bboxMin = triple(raw.bboxMin, "bboxMin", label);
  const bboxMax = triple(raw.bboxMax, "bboxMax", label);
  if (typeof raw.voxelSize !== "number") {
    throw new Error(`${label}: ${META_KEY} voxelSize must be a number.`);
  }
  const decode = raw.decode;
  if (!isRecord(decode) || typeof decode.scale !== "number" || typeof decode.offset !== "number") {
    throw new Error(`${label}: ${META_KEY} decode must be { scale, offset } numbers.`);
  }
  return {
    ...raw,
    version: 1,
    bboxMin,
    bboxMax,
    voxelSize: raw.voxelSize,
    decode: { scale: decode.scale, offset: decode.offset }
  };
};

const triple = (value: unknown, field: string, label: string): Vec3 => {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number")
  ) {
    const [x, y, z] = value as number[];
    return [x!, y!, z!];
  }
  throw new Error(`${label}: ${META_KEY} ${field} must be three numbers.`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
