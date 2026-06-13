export { createShaderBackground } from "./createShaderBackground";
export { glsl, glslUtils } from "./glsl";
export type {
  CreateShaderBackgroundOptions,
  DprOption,
  ExplicitUniformInput,
  RenderMode,
  RenderState,
  ShaderBackgroundInstance,
  ShaderLayer,
  ShaderStatus,
  TextureInput,
  TextureMap,
  TextureOptions,
  TextureSource,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue,
} from "./types";
export {
  DestroyedError,
  ShaderCompileError,
  ShaderError,
  TargetNotFoundError,
  TextureLoadError,
  UnsupportedError,
} from "./internal/errors";
