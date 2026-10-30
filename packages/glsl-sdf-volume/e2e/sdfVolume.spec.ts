import { expect, test, type Page } from "@playwright/test";
import { sdfVolume } from "../src/index";

// A sphere of radius 0.5 baked into a 32³ volume over [-1, 1]³. Pixel i of a
// 1-row float target holds frapx_sdVolume and frapx_sdVolumeGrad at probe i.

const N = 32;
const RADIUS = 0.5;
const VOXEL = 2 / N;

const fragment = (count: number) => `#version 300 es
precision highp float;
uniform highp sampler3D u_sdf;
uniform vec3 u_sdfMin;
uniform vec3 u_sdfMax;
uniform float u_sdfScale;
uniform float u_sdfOffset;
uniform vec3 u_probes[${count}];
out vec4 fragColor;
${sdfVolume}
void main() {
  vec3 p = u_probes[int(gl_FragCoord.x)];
  fragColor = vec4(
    frapx_sdVolume(u_sdf, p, u_sdfMin, u_sdfMax, u_sdfScale, u_sdfOffset),
    frapx_sdVolumeGrad(u_sdf, p, u_sdfMin, u_sdfMax, u_sdfScale, u_sdfOffset)
  );
}`;

const vertex = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

type Format = "r8" | "r16f";
type EvalResult = { error: string } | { values: number[] };

const evaluate = (page: Page, format: Format, probes: number[][]) =>
  page.evaluate(
    ({ vertex, fragment, format, probes, N, RADIUS }): EvalResult => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      if (!gl) return { error: "WebGL2 is unavailable" };
      if (!gl.getExtension("EXT_color_buffer_float")) {
        return { error: "EXT_color_buffer_float is unavailable" };
      }

      // r8 stores clamp(d / band, -1, 1) * 0.5 + 0.5 with band = 8 voxels,
      // as 3dsdf-texture does; r16f stores d as half float.
      const band = 8 * (2 / N);
      const f32 = new Float32Array(1);
      const u32 = new Uint32Array(f32.buffer);
      const toHalf = (value: number) => {
        f32[0] = value;
        const x = u32[0]!;
        const sign = (x >>> 16) & 0x8000;
        const exponent = ((x >>> 23) & 0xff) - 127 + 15;
        if (exponent <= 0) return sign;
        const mantissa = x & 0x7fffff;
        return (sign | (exponent << 10) | (mantissa >>> 13)) + ((mantissa >>> 12) & 1);
      };
      const data = format === "r8" ? new Uint8Array(N * N * N) : new Uint16Array(N * N * N);
      for (let z = 0; z < N; z += 1) {
        for (let y = 0; y < N; y += 1) {
          for (let x = 0; x < N; x += 1) {
            const center = [x, y, z].map((i) => -1 + (i + 0.5) * (2 / N));
            const d = Math.hypot(center[0]!, center[1]!, center[2]!) - RADIUS;
            data[x + N * (y + N * z)] =
              format === "r8"
                ? Math.round((Math.max(-1, Math.min(1, d / band)) * 0.5 + 0.5) * 255)
                : toHalf(d);
          }
        }
      }
      const decode = format === "r8" ? [2 * band, -band] : [1, 0];

      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) ?? "compile failed");
        }
        return shader;
      };
      const program = gl.createProgram()!;
      try {
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      } catch (error) {
        return { error: String(error) };
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return { error: gl.getProgramInfoLog(program) ?? "link failed" };
      }

      const volume = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, volume);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(
        gl.TEXTURE_3D, 0, format === "r8" ? gl.R8 : gl.R16F, N, N, N, 0, gl.RED,
        format === "r8" ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT, data
      );
      for (const pname of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
        gl.texParameteri(gl.TEXTURE_3D, pname, gl.CLAMP_TO_EDGE);
      }
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const width = probes.length;
      const target = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, "u_sdf"), 1);
      gl.uniform3f(gl.getUniformLocation(program, "u_sdfMin"), -1, -1, -1);
      gl.uniform3f(gl.getUniformLocation(program, "u_sdfMax"), 1, 1, 1);
      gl.uniform1f(gl.getUniformLocation(program, "u_sdfScale"), decode[0]!);
      gl.uniform1f(gl.getUniformLocation(program, "u_sdfOffset"), decode[1]!);
      gl.uniform3fv(gl.getUniformLocation(program, "u_probes"), probes.flat());
      gl.viewport(0, 0, width, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const pixels = new Float32Array(width * 4);
      gl.readPixels(0, 0, width, 1, gl.RGBA, gl.FLOAT, pixels);
      return { values: Array.from(pixels) };
    },
    { vertex, fragment: fragment(probes.length), format, probes, N, RADIUS }
  );

const sphere = (p: number[]) => Math.hypot(p[0]!, p[1]!, p[2]!) - RADIUS;
const boxDistance = (p: number[]) =>
  Math.hypot(...p.map((c) => Math.max(Math.abs(c) - 1, 0)));

// Deterministic points from a fixed LCG.
const points = (count: number, min: number, max: number, seed: number) => {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return min + (state / 2 ** 32) * (max - min);
  };
  return Array.from({ length: count }, () => [next(), next(), next()]);
};

const run = async (page: Page, format: Format, probes: number[][]) => {
  const result = await evaluate(page, format, probes);
  if ("error" in result) throw new Error(result.error);
  return probes.map((p, i) => ({ p, d: result.values[i * 4]!, grad: result.values.slice(i * 4 + 1, i * 4 + 4) }));
};

test.beforeEach(async ({ page }) => {
  await page.goto("about:blank");
});

test("inside the box, the distance is within half a voxel of the sphere's", async ({ page }) => {
  const probes = points(64, -0.95, 0.95, 1).filter((p) => Math.hypot(...p) > 0.15);
  for (const { p, d } of await run(page, "r16f", probes)) {
    expect(Math.abs(d - sphere(p)), `at ${p}`).toBeLessThanOrEqual(VOXEL / 2);
  }
});

test("outside the box, the distance is max(b, e - b): a lower bound above the box distance", async ({
  page
}) => {
  const probes = [
    ...points(48, -3, 3, 2).filter((p) => boxDistance(p) > 0.01),
    [1.2, 0, 0],
    [0, -1.1, 0.2],
    [1.5, 1.5, 1.5]
  ];
  for (const { p, d } of await run(page, "r16f", probes)) {
    const b = boxDistance(p);
    expect(d, `at ${p}`).toBeLessThanOrEqual(sphere(p) + 1e-3);
    expect(d, `at ${p}`).toBeGreaterThanOrEqual(b - 1e-4);
  }

  // Close to a face the e - b term takes over: at x = 1.2 the box is 0.2
  // away, the face value is 0.5, the true distance 0.7.
  const [near] = await run(page, "r16f", [[1.2, 0, 0]]);
  expect(near!.d).toBeCloseTo(0.3, 1);
});

test("the gradient points away from the sphere with unit length", async ({ page }) => {
  const probes = points(64, -0.9, 0.9, 3).filter((p) => {
    const r = Math.hypot(...p);
    return r > 0.25 && r < 0.9;
  });
  for (const { p, grad } of await run(page, "r16f", probes)) {
    const length = Math.hypot(...grad);
    const r = Math.hypot(...p);
    const cosine = (grad[0]! * p[0]! + grad[1]! * p[1]! + grad[2]! * p[2]!) / (length * r);
    expect(cosine, `at ${p}`).toBeGreaterThan(0.99);
    expect(Math.abs(length - 1), `at ${p}`).toBeLessThan(0.1);
  }
});

test("r8 decodes through scale and offset near the surface", async ({ page }) => {
  const probes = points(64, -0.95, 0.95, 4).filter((p) => Math.abs(sphere(p)) < 0.3);
  for (const { p, d } of await run(page, "r8", probes)) {
    expect(Math.abs(d - sphere(p)), `at ${p}`).toBeLessThanOrEqual(VOXEL / 2);
  }
});
