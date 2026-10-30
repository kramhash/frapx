import { expect, test, type Page } from "@playwright/test";
import type { createParticles } from "../src";

// A sphere of radius 0.5 baked into a 32³ r16f volume over [-1, 1]³, placed
// with size 0.8 at [0.5, 0.5, 0.5] and perspective 0: in particle space a
// sphere of radius 0.2 around (0, 0, 0.5), a voxel 0.025 across. Particle
// positions are read back from the transform feedback buffer the last step
// wrote, through a getContext wrapper installed before the instance exists.

type Win = typeof window & {
  __frapx: { createParticles: typeof createParticles };
  __sdfTest: {
    sphere(radius?: number): unknown;
    // [x, y, z, age] of every live particle.
    read(gl: WebGL2RenderingContext, pool: number): number[][];
  };
};

const RADIUS = 0.2;
const VOXEL = 0.025;
const CENTER = [0, 0, 0.5];

const open = async (page: Page) => {
  await page.goto("/?test");
  await page.waitForFunction(() => (window as Win).__frapx !== undefined);
  await page.evaluate(() => {
    const written = new WeakMap<WebGL2RenderingContext, WebGLBuffer>();
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const gl = (getContext as (...a: unknown[]) => unknown).apply(this, args);
      if (args[0] === "webgl2" && gl && !written.has(gl as WebGL2RenderingContext)) {
        const context = gl as WebGL2RenderingContext;
        const bindBufferBase = context.bindBufferBase.bind(context);
        context.bindBufferBase = (target, index, buffer) => {
          if (target === context.TRANSFORM_FEEDBACK_BUFFER && buffer) written.set(context, buffer);
          bindBufferBase(target, index, buffer);
        };
        written.set(context, null as unknown as WebGLBuffer);
      }
      return gl;
    } as typeof getContext;

    const N = 32;
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

    (window as Win).__sdfTest = {
      sphere: (radius = 0.5) => {
        const data = new Uint16Array(N * N * N);
        for (let z = 0; z < N; z += 1) {
          for (let y = 0; y < N; y += 1) {
            for (let x = 0; x < N; x += 1) {
              const c = [x, y, z].map((i) => -1 + (i + 0.5) * (2 / N));
              data[x + N * (y + N * z)] = toHalf(Math.hypot(c[0]!, c[1]!, c[2]!) - radius);
            }
          }
        }
        const meta = {
          version: 1,
          bboxMin: [-1, -1, -1],
          bboxMax: [1, 1, 1],
          voxelSize: 2 / N,
          decode: { scale: 1, offset: 0 }
        };
        return {
          texture: { data, size: [N, N, N], format: "r16f", filter: "linear", wrap: "clamp" },
          uniforms: (name = "sdf") => ({
            [`${name}Min`]: meta.bboxMin,
            [`${name}Max`]: meta.bboxMax,
            [`${name}Scale`]: 1,
            [`${name}Offset`]: 0
          }),
          meta
        };
      },
      read: (gl, pool) => {
        const values = new Float32Array(pool * 12);
        gl.bindBuffer(gl.COPY_READ_BUFFER, written.get(gl)!);
        gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, values);
        gl.bindBuffer(gl.COPY_READ_BUFFER, null);
        const live: number[][] = [];
        for (let i = 0; i < pool; i += 1) {
          const age = values[i * 12 + 3]!;
          const life = values[i * 12 + 7]!;
          if (life > 0 && age < life) live.push([values[i * 12]!, values[i * 12 + 1]!, values[i * 12 + 2]!, age]);
        }
        return live;
      }
    };
  });
};

// Live particles at each time, after capturing that frame.
const run = (
  page: Page,
  sdf: Record<string, unknown>,
  options: Record<string, unknown>,
  times: number[],
  sphereRadius = 0.5
) =>
  page.evaluate(
    async ({ sdf, options, times, sphereRadius }) => {
      const { createParticles } = (window as Win).__frapx;
      const { sphere, read } = (window as Win).__sdfTest;
      const particles = createParticles({
        clock: "manual",
        resolution: [160, 90],
        perspective: 0,
        prewarm: 0,
        lifetime: [100, 100],
        ...options,
        sdf: { volume: sphere(sphereRadius), size: 0.8, center: [0.5, 0.5, 0.5], ...sdf }
      } as Parameters<typeof createParticles>[0]);
      await particles.ready;
      const frames: number[][][] = [];
      for (const time of times) {
        particles.setTime(time);
        await particles.captureFrame({ format: "rgba8" });
        frames.push(read(particles.gl!, particles.maxParticles));
      }
      particles.destroy();
      return frames;
    },
    { sdf, options, times, sphereRadius }
  );

const radius = (p: number[]) => Math.hypot(p[0]! - CENTER[0]!, p[1]! - CENTER[1]!, p[2]! - CENTER[2]!);
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

test.beforeEach(async ({ page }) => {
  await open(page);
});

test("emit: surface spawns within half a voxel of the surface", async ({ page }) => {
  const [live] = await run(page, { emit: "surface" }, { rate: 200 }, [1]);
  expect(live!.length).toBeGreaterThan(150);
  for (const p of live!) expect(Math.abs(radius(p) - RADIUS), `at ${p}`).toBeLessThan(VOXEL / 2);
});

test("emit: inside spawns throughout the shape", async ({ page }) => {
  // A sphere of radius 0.8 fills 27% of its box, so 16 tries almost always
  // land inside (a miss falls back to the surface).
  const big = 0.8 * 0.4;
  const [live] = await run(page, { emit: "inside" }, { rate: 200 }, [1], 0.8);
  expect(live!.length).toBeGreaterThan(150);
  const radii = live!.map(radius);
  for (const r of radii) expect(r).toBeLessThan(big + VOXEL / 4);
  // Uniform in a ball the mean radius is 3/4 of it; on the surface it is 1.
  expect(mean(radii) / big).toBeLessThan(0.8);
});

test("attract: particles from the whole viewport settle on the surface", async ({ page }) => {
  const [start, settled] = await run(
    page,
    { attract: { strength: 30 } },
    { rate: 300, emitter: { depth: [0.5, 0.5] }, forces: { drag: 4 } },
    [0.5, 6]
  );
  const before = mean(start!.map((p) => Math.abs(radius(p) - RADIUS)));
  const old = settled!.filter((p) => p[3]! > 4);
  expect(old.length).toBeGreaterThan(100);
  const after = mean(old.map((p) => Math.abs(radius(p) - RADIUS)));
  expect(before).toBeGreaterThan(0.1);
  expect(after).toBeLessThan(VOXEL / 2);
});

test("collide: falling particles never end up inside", async ({ page }) => {
  const options = {
    rate: 100,
    emitter: { area: [0.47, 0.75, 0.53, 0.8], depth: [0.5, 0.5] },
    forces: { gravity: [0, -1, 0] }
  };
  const times = [0.5, 0.8, 1.2, 2];
  const inner = (frames: number[][][]) => Math.min(...frames.flat().map(radius));

  const free = await run(page, {}, options, times);
  expect(inner(free)).toBeLessThan(RADIUS - 0.05);

  const colliding = await run(page, { collide: {} }, options, times);
  expect(colliding.flat().length).toBeGreaterThan(100);
  expect(inner(colliding)).toBeGreaterThan(RADIUS - VOXEL / 2);
});

test("with sdf, a split render matches a straight one byte for byte", async ({ page }) => {
  const same = await page.evaluate(async () => {
    const { createParticles } = (window as Win).__frapx;
    const { sphere } = (window as Win).__sdfTest;
    const volume = sphere();
    const options = {
      clock: "manual",
      resolution: [160, 90],
      rate: 120,
      forces: { drag: 2, curl: { strength: 0.2 } },
      sdf: { volume, size: 0.8, emit: "surface", attract: { strength: 10 }, collide: { bounce: 0.3 } }
    } as Parameters<typeof createParticles>[0];
    const straight = createParticles(options);
    const split = createParticles(options);
    await Promise.all([straight.ready, split.ready]);

    let a: Uint8Array = new Uint8Array();
    for (let frame = 0; frame <= 59; frame += 1) {
      straight.setTime(frame / 30);
      a = (await straight.captureFrame({ format: "rgba8" })) as Uint8Array;
    }
    let b: Uint8Array = new Uint8Array();
    for (let frame = 40; frame <= 59; frame += 1) {
      split.setTime(frame / 30);
      b = (await split.captureFrame({ format: "rgba8" })) as Uint8Array;
    }
    straight.destroy();
    split.destroy();
    let covered = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i]! > 0) covered += 1;
    return { covered, same: a.length === b.length && a.every((v, i) => v === b[i]) };
  });
  expect(same.covered).toBeGreaterThan(20);
  expect(same.same).toBe(true);
});
