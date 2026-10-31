import type { GLContext, TextureInput, TextureMap } from "../types";
import { TextureLoadError } from "./errors";
import { loadTexture, type LoadedTexture, type TextureWarn } from "./textures";

export type TextureSet = {
  /** The textures loaded so far, by name. */
  readonly textures: ReadonlyMap<string, LoadedTexture>;
  /** Whether `name` was given as an input, loaded or not. */
  hasInput(name: string): boolean;
  /**
   * Returns the texture unit for `name`, taking the lowest free unit on first
   * use. Runtimes reserve units for their own samplers (feedback, pass inputs)
   * here too, so they never collide with image textures.
   */
  reserveUnit(gl: GLContext, name: string): number;
  /**
   * Loads every input, then replaces the previously loaded textures. Used for
   * the initial load and after a context restore.
   */
  loadAll(gl: GLContext, isCancelled: () => boolean): Promise<void>;
  /**
   * Loads `input` as `name`. Resolves to the loaded texture, or `null` when a
   * later `set()` for the same name or `isCancelled()` superseded it (its
   * texture is deleted). On failure the unit is released if `name` is unused,
   * and the error is rethrown.
   */
  set(
    gl: GLContext,
    name: string,
    input: TextureInput,
    isCancelled: () => boolean
  ): Promise<LoadedTexture | null>;
  /**
   * Binds every loaded texture to its unit and points its sampler uniform at
   * it. Calls `onMissing` with the uniform name when the program lacks it.
   */
  bind(
    gl: GLContext,
    locations: ReadonlyMap<string, WebGLUniformLocation>,
    onMissing?: (uniformName: string) => void
  ): void;
  /**
   * Drops every loaded texture without deleting it. Used when the GL context
   * is lost: the textures died with the context, so deleting them against the
   * next context would only log INVALID_OPERATION. Inputs and units are kept,
   * so a restore reloads the same inputs onto the same units.
   */
  forget(): void;
  /** Deletes every loaded texture. */
  dispose(gl: GLContext): void;
};

export type TextureSetOptions = {
  /** Receives warnings about textures loaded differently than asked. */
  warn?: TextureWarn;
};

/**
 * Tracks named image and data textures and the texture units they occupy, for
 * a runtime that binds them to one or more programs.
 */
export const createTextureSet = (
  inputs: TextureMap = {},
  options: TextureSetOptions = {}
): TextureSet => {
  const textureInputs = new Map<string, TextureInput>(Object.entries(inputs));
  let textures = new Map<string, LoadedTexture>();
  const units = new Map<string, number>();
  const versions = new Map<string, number>();

  const reserveUnit = (gl: GLContext, name: string): number => {
    const existing = units.get(name);
    if (existing !== undefined) return existing;

    const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
    const used = new Set(units.values());
    for (let unit = 0; unit < maxUnits; unit += 1) {
      if (!used.has(unit)) {
        units.set(name, unit);
        return unit;
      }
    }

    throw new TextureLoadError(
      `Texture unit limit exceeded while loading texture: ${name}`
    );
  };

  return {
    get textures() {
      return textures;
    },

    hasInput(name) {
      return textureInputs.has(name);
    },

    reserveUnit,

    forget() {
      textures = new Map();
    },

    async loadAll(gl, isCancelled) {
      const loaded = new Map<string, LoadedTexture>();
      for (const [name, input] of textureInputs) {
        if (isCancelled()) break;
        const unit = reserveUnit(gl, name);
        loaded.set(name, await loadTexture(gl, name, input, unit, options.warn));
      }

      for (const texture of textures.values()) {
        gl.deleteTexture(texture.texture);
      }
      textures = loaded;
    },

    async set(gl, name, input, isCancelled) {
      const version = (versions.get(name) ?? 0) + 1;
      versions.set(name, version);

      try {
        const unit = reserveUnit(gl, name);
        const loaded = await loadTexture(gl, name, input, unit, options.warn);

        if (isCancelled() || versions.get(name) !== version) {
          gl.deleteTexture(loaded.texture);
          return null;
        }

        const previous = textures.get(name);
        textureInputs.set(name, input);
        textures.set(name, loaded);
        if (previous) gl.deleteTexture(previous.texture);
        return loaded;
      } catch (error) {
        if (!textures.has(name) && !textureInputs.has(name)) {
          units.delete(name);
        }
        throw error;
      }
    },

    bind(gl, locations, onMissing) {
      for (const texture of textures.values()) {
        const unit = units.get(texture.name);
        if (unit === undefined) continue;
        const location = locations.get(texture.uniformName);
        if (!location) {
          onMissing?.(texture.uniformName);
          continue;
        }

        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(texture.target, texture.texture);
        gl.uniform1i(location, unit);
      }
    },

    dispose(gl) {
      for (const texture of textures.values()) {
        gl.deleteTexture(texture.texture);
      }
    }
  };
};
