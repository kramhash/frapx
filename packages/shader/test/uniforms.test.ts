import { describe, expect, it } from "vitest";
import { normalizeUniform } from "../src/internal/uniforms";

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
});
