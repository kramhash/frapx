import { describe, expect, it } from "vitest";
import {
  applyProgramUniform,
  createUniformCache,
  normalizeUniform
} from "../src/internal/uniforms";

describe("normalizeUniform", () => {
  it("infers scalar and vector types", () => {
    expect(normalizeUniform(1)).toEqual({ type: "float", value: [1] });
    expect(normalizeUniform([1, 2])).toEqual({ type: "vec2", value: [1, 2] });
    expect(normalizeUniform([1, 2, 3])).toEqual({
      type: "vec3",
      value: [1, 2, 3]
    });
    expect(normalizeUniform([1, 2, 3, 4])).toEqual({
      type: "vec4",
      value: [1, 2, 3, 4]
    });
  });

  it("uses explicit type when provided", () => {
    expect(normalizeUniform({ type: "mat3", value: new Float32Array(9) }).type)
      .toBe("mat3");
  });

  it("normalizes custom uniform names with the u_ prefix", () => {
    const cache = createUniformCache({
      progress: 0.25,
      u_velocity: 0.5
    });

    expect(cache.get("u_progress")).toEqual({
      type: "float",
      value: [0.25]
    });
    expect(cache.get("u_velocity")).toEqual({
      type: "float",
      value: [0.5]
    });
  });

  it("binds the target program before applying a uniform", () => {
    const calls: string[] = [];
    const program = {} as WebGLProgram;
    const location = {} as WebGLUniformLocation;
    const gl = {
      useProgram(value: WebGLProgram) {
        expect(value).toBe(program);
        calls.push("useProgram");
      },
      uniform1f(value: WebGLUniformLocation, numberValue: number) {
        expect(value).toBe(location);
        expect(numberValue).toBe(0.75);
        calls.push("uniform1f");
      }
    } as unknown as WebGLRenderingContext;

    applyProgramUniform(gl, program, location, {
      type: "float",
      value: [0.75]
    });

    expect(calls).toEqual(["useProgram", "uniform1f"]);
  });
});
