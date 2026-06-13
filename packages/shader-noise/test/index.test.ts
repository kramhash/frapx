import { describe, expect, it } from "vitest";
import {
  fbm3d,
  noise3d,
  noise3dCommon,
  perlin3d,
  periodicPerlin3d,
  simplex3d
} from "../src/index";

describe("@frapx/shader-noise", () => {
  it("exports self-contained 3d noise snippets", () => {
    expect(simplex3d).toContain("float frapx_simplex3d(vec3 v)");
    expect(perlin3d).toContain("float frapx_perlin3d(vec3 P)");
    expect(periodicPerlin3d).toContain(
      "float frapx_periodicPerlin3d(vec3 P, vec3 rep)"
    );
    expect(fbm3d).toContain("float frapx_fbm3d(vec3 p)");
  });

  it("prefixes shared helper names", () => {
    expect(noise3dCommon).toContain("frapx_mod289");
    expect(noise3dCommon).toContain("frapx_permute");
    expect(noise3dCommon).not.toContain("float snoise");
    expect(noise3dCommon).not.toContain("float cnoise");
    expect(noise3dCommon).not.toContain("float pnoise");
  });

  it("provides a combined snippet for using multiple functions together", () => {
    expect(noise3d).toContain("float frapx_simplex3d");
    expect(noise3d).toContain("float frapx_perlin3d");
    expect(noise3d).toContain("float frapx_periodicPerlin3d");
    expect(noise3d).toContain("float frapx_fbm3d");
  });
});
