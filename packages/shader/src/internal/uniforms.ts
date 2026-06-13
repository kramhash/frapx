import type { ExplicitUniformInput, UniformInput, UniformType } from "../types";
import { toUniformName } from "./names";

export type NormalizedUniform = {
  type: UniformType;
  value: number[] | Float32Array;
};

export const normalizeUniform = (input: UniformInput): NormalizedUniform => {
  if (typeof input === "number") {
    return { type: "float", value: [input] };
  }

  if (input instanceof Float32Array) {
    if (input.length === 9) return { type: "mat3", value: input };
    if (input.length === 16) return { type: "mat4", value: input };
    if (input.length === 2) return { type: "vec2", value: input };
    if (input.length === 3) return { type: "vec3", value: input };
    if (input.length === 4) return { type: "vec4", value: input };
  }

  if (isExplicitUniform(input)) {
    return { type: input.type, value: input.value };
  }

  if (Array.isArray(input)) {
    if (input.length === 2) return { type: "vec2", value: input };
    if (input.length === 3) return { type: "vec3", value: input };
    if (input.length === 4) return { type: "vec4", value: input };
  }

  return { type: "float", value: [0] };
};

export const applyUniform = (
  gl: WebGLRenderingContext,
  location: WebGLUniformLocation,
  uniform: NormalizedUniform
): void => {
  const value = uniform.value;

  switch (uniform.type) {
    case "float":
      gl.uniform1f(location, value[0] ?? 0);
      break;
    case "vec2":
      gl.uniform2f(location, value[0] ?? 0, value[1] ?? 0);
      break;
    case "vec3":
      gl.uniform3f(location, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
      break;
    case "vec4":
      gl.uniform4f(
        location,
        value[0] ?? 0,
        value[1] ?? 0,
        value[2] ?? 0,
        value[3] ?? 0
      );
      break;
    case "mat3":
      gl.uniformMatrix3fv(location, false, value);
      break;
    case "mat4":
      gl.uniformMatrix4fv(location, false, value);
      break;
  }
};

export const applyProgramUniform = (
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  location: WebGLUniformLocation,
  uniform: NormalizedUniform
): void => {
  gl.useProgram(program);
  applyUniform(gl, location, uniform);
};

export const collectUniformLocations = (
  gl: WebGLRenderingContext,
  program: WebGLProgram
): Map<string, WebGLUniformLocation> => {
  const locations = new Map<string, WebGLUniformLocation>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;

  for (let index = 0; index < count; index += 1) {
    const active = gl.getActiveUniform(program, index);
    if (!active) continue;

    const name = active.name.replace(/\[0\]$/, "");
    const location = gl.getUniformLocation(program, name);
    if (location) {
      locations.set(name, location);
    }
  }

  return locations;
};

export const createUniformCache = (
  uniforms: Record<string, UniformInput> | undefined
): Map<string, NormalizedUniform> => {
  const cache = new Map<string, NormalizedUniform>();

  for (const [name, value] of Object.entries(uniforms ?? {})) {
    cache.set(toUniformName(name), normalizeUniform(value));
  }

  return cache;
};

const isExplicitUniform = (input: unknown): input is ExplicitUniformInput => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return "type" in input && "value" in input;
};
