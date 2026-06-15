import type { TextureInput, TextureOptions, TextureSource } from "../types";
import { TextureLoadError } from "./errors";
import { toUniformName } from "./names";

export type LoadedTexture = {
  name: string;
  uniformName: string;
  sizeUniformName: string;
  texture: WebGLTexture;
  width: number;
  height: number;
};

export const loadTextures = async (
  gl: WebGLRenderingContext,
  textures: Record<string, TextureInput> | undefined,
  isDestroyed: () => boolean
): Promise<LoadedTexture[]> => {
  const entries = Object.entries(textures ?? {});
  const loaded: LoadedTexture[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    if (isDestroyed()) break;
    const [name, input] = entries[index] as [string, TextureInput];
    loaded.push(await loadTexture(gl, name, input, index));
  }

  return loaded;
};

export const loadTexture = async (
  gl: WebGLRenderingContext,
  name: string,
  input: TextureInput,
  unit: number
): Promise<LoadedTexture> => {
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
    width: getSourceWidth(source),
    height: getSourceHeight(source)
  };
};

const normalizeTextureInput = (input: TextureInput): TextureOptions => {
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
  } catch (error) {
    throw new TextureLoadError(`Failed to load texture: ${source}`);
  }

  return image;
};

const getWrap = (
  gl: WebGLRenderingContext,
  wrap: NonNullable<TextureOptions["wrap"]>
): number => {
  if (wrap === "repeat") return gl.REPEAT;
  if (wrap === "mirror") return gl.MIRRORED_REPEAT;
  return gl.CLAMP_TO_EDGE;
};

const getFilter = (
  gl: WebGLRenderingContext,
  filter: NonNullable<TextureOptions["filter"]>
): number => (filter === "nearest" ? gl.NEAREST : gl.LINEAR);

const isTextureSource = (input: unknown): input is HTMLImageElement | HTMLCanvasElement =>
  typeof HTMLImageElement !== "undefined" &&
  (input instanceof HTMLImageElement || input instanceof HTMLCanvasElement);

const getSourceWidth = (source: HTMLImageElement | HTMLCanvasElement): number =>
  "naturalWidth" in source ? source.naturalWidth : source.width;

const getSourceHeight = (source: HTMLImageElement | HTMLCanvasElement): number =>
  "naturalHeight" in source ? source.naturalHeight : source.height;
