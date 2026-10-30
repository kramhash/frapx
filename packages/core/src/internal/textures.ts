import type {
  DataTextureFormat,
  DataTextureOptions,
  GLContext,
  TextureInput,
  TextureOptions,
  TextureSource
} from "../types";
import { TextureLoadError } from "./errors";
import { toUniformName } from "./names";
import type { NormalizedUniform } from "./uniforms";
import { isWebGL2Context } from "./webgl";

export type LoadedTexture = {
  name: string;
  uniformName: string;
  sizeUniformName: string;
  texture: WebGLTexture;
  /** `TEXTURE_2D` for images, `TEXTURE_3D` for data textures. */
  target: number;
  width: number;
  height: number;
  /** Depth of a 3D data texture; `null` for 2D textures. */
  depth: number | null;
};

/** Called with a message when a texture is loaded differently than asked. */
export type TextureWarn = (message: string) => void;

export const loadTexture = async (
  gl: GLContext,
  name: string,
  input: TextureInput,
  unit: number,
  warn?: TextureWarn
): Promise<LoadedTexture> => {
  if (isDataTextureOptions(input)) {
    return loadDataTexture(gl, name, input, unit, warn);
  }

  const options = normalizeTextureInput(input);
  const source = await resolveSource(options.source);
  const texture = gl.createTexture();

  if (!texture) {
    throw new TextureLoadError(`Failed to create texture: ${name}`);
  }

  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, options.flipY ?? true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

  const wrap = getWrap(gl, options.wrap ?? "clamp");
  const filter = getFilter(gl, options.filter ?? "linear");

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

  return {
    name,
    uniformName: toUniformName(name),
    sizeUniformName: toUniformName(`${name}Size`),
    texture,
    target: gl.TEXTURE_2D,
    width: getSourceWidth(source),
    height: getSourceHeight(source),
    depth: null
  };
};

/** The `u_<name>Size` uniform: vec2 for 2D textures, vec3 for 3D ones. */
export const getTextureSizeUniform = (texture: LoadedTexture): NormalizedUniform =>
  texture.depth === null
    ? { type: "vec2", value: [texture.width, texture.height] }
    : { type: "vec3", value: [texture.width, texture.height, texture.depth] };

const DATA_FORMATS: Record<
  DataTextureFormat,
  {
    array: string;
    matches: (data: DataTextureOptions["data"]) => boolean;
    upload: (gl: WebGL2RenderingContext) => { internal: number; type: number };
  }
> = {
  r8: {
    array: "Uint8Array",
    matches: (data) => data instanceof Uint8Array,
    upload: (gl) => ({ internal: gl.R8, type: gl.UNSIGNED_BYTE })
  },
  r16f: {
    array: "Uint16Array",
    matches: (data) => data instanceof Uint16Array,
    upload: (gl) => ({ internal: gl.R16F, type: gl.HALF_FLOAT })
  },
  r32f: {
    array: "Float32Array",
    matches: (data) => data instanceof Float32Array,
    upload: (gl) => ({ internal: gl.R32F, type: gl.FLOAT })
  }
};

const loadDataTexture = (
  gl: GLContext,
  name: string,
  options: DataTextureOptions,
  unit: number,
  warn: TextureWarn | undefined
): LoadedTexture => {
  if (!isWebGL2Context(gl)) {
    throw new TextureLoadError(`3D textures need WebGL2: ${name}`);
  }

  const format = DATA_FORMATS[options.format];
  if (!format) {
    throw new TextureLoadError(
      `Unknown data texture format "${String(options.format)}": ${name}`
    );
  }

  const [nx, ny, nz] = options.size;
  if (![nx, ny, nz].every((n) => Number.isInteger(n) && n > 0)) {
    throw new TextureLoadError(
      `Data texture size must be three positive integers, got [${options.size.join(", ")}]: ${name}`
    );
  }
  if (!format.matches(options.data)) {
    throw new TextureLoadError(
      `Data texture format "${options.format}" needs a ${format.array}: ${name}`
    );
  }
  if (options.data.length !== nx * ny * nz) {
    throw new TextureLoadError(
      `Data texture has ${options.data.length} values, size [${nx}, ${ny}, ${nz}] needs ${nx * ny * nz}: ${name}`
    );
  }

  let filterName = options.filter ?? "linear";
  if (
    options.format === "r32f" &&
    filterName === "linear" &&
    gl.getExtension("OES_texture_float_linear") === null
  ) {
    filterName = "nearest";
    warn?.(
      `r32f texture "${name}" is sampled with nearest filtering: OES_texture_float_linear is unavailable.`
    );
  }

  const texture = gl.createTexture();
  if (!texture) {
    throw new TextureLoadError(`Failed to create texture: ${name}`);
  }

  const { internal, type } = format.upload(gl);
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_3D, texture);
  // texImage3D from an ArrayBufferView fails with UNPACK_FLIP_Y_WEBGL set,
  // which image uploads leave on by default.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, internal, nx, ny, nz, 0, gl.RED, type, options.data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

  const wrap = getWrap(gl, options.wrap ?? "clamp");
  const filter = getFilter(gl, filterName);

  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, wrap);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);

  return {
    name,
    uniformName: toUniformName(name),
    sizeUniformName: toUniformName(`${name}Size`),
    texture,
    target: gl.TEXTURE_3D,
    width: nx,
    height: ny,
    depth: nz
  };
};

const isDataTextureOptions = (input: TextureInput): input is DataTextureOptions =>
  typeof input === "object" && "data" in input;

const normalizeTextureInput = (
  input: TextureSource | TextureOptions
): TextureOptions => {
  if (typeof input === "string" || isTextureSource(input)) {
    return { source: input };
  }

  return input;
};

const resolveSource = async (
  source: TextureSource
): Promise<HTMLImageElement | HTMLCanvasElement> => {
  if (typeof source !== "string") {
    return source;
  }

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = source;

  try {
    await image.decode();
  } catch {
    throw new TextureLoadError(`Failed to load texture: ${source}`);
  }

  return image;
};

const getWrap = (
  gl: GLContext,
  wrap: NonNullable<TextureOptions["wrap"]>
): number => {
  if (wrap === "repeat") return gl.REPEAT;
  if (wrap === "mirror") return gl.MIRRORED_REPEAT;
  return gl.CLAMP_TO_EDGE;
};

const getFilter = (
  gl: GLContext,
  filter: NonNullable<TextureOptions["filter"]>
): number => (filter === "nearest" ? gl.NEAREST : gl.LINEAR);

const isTextureSource = (
  input: unknown
): input is HTMLImageElement | HTMLCanvasElement =>
  typeof HTMLImageElement !== "undefined" &&
  (input instanceof HTMLImageElement || input instanceof HTMLCanvasElement);

const getSourceWidth = (
  source: HTMLImageElement | HTMLCanvasElement
): number =>
  "naturalWidth" in source ? source.naturalWidth : source.width;

const getSourceHeight = (
  source: HTMLImageElement | HTMLCanvasElement
): number =>
  "naturalHeight" in source ? source.naturalHeight : source.height;
