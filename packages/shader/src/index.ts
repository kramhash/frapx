export { createShaderBackground } from "./createShaderBackground";
export { hexToRgb, hexToRgba } from "./color";
export type { Rgb, Rgba } from "./color";
export { glsl, glslUtils } from "./glsl";
export type {
  CreateShaderBackgroundOptions,
  DprOption,
  ExplicitUniformInput,
  FeedbackOptions,
  GLContext,
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
  UniformScalar,
  UniformType,
  UniformVec2,
  UniformVec3,
  UniformVec4,
} from "./types";
export {
  DestroyedError,
  ShaderCompileError,
  ShaderError,
  TargetNotFoundError,
  TextureLoadError,
  UnsupportedError,
} from "./internal/errors";
