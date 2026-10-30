import { expect, test, type Page } from "@playwright/test";

type Instance = {
  status: string;
  gl: WebGL2RenderingContext | null;
  canvas: HTMLCanvasElement | null;
  ready: Promise<void>;
  captureFrame(options: { format: "rgba8" }): Promise<Uint8Array>;
  destroy(): void;
};

type Win = typeof window & {
  __frapx?: { createShaderBackground(options: unknown): Instance };
  __volume?: Instance;
};

// One pixel per voxel of a 4×3×2 volume: x = column, y = row % 3, z = row / 3.
// Red is the voxel, green and blue are u_volumeSize.y / 8 and .z / 8.
const fragment = `#version 300 es
precision highp float;
uniform highp sampler3D u_volume;
uniform vec3 u_volumeSize;
out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float v = texelFetch(u_volume, ivec3(p.x, p.y % 3, p.y / 3), 0).r;
  outColor = vec4(v, u_volumeSize.y / 8.0, u_volumeSize.z / 8.0, 1.0);
}
`;

const open = async (page: Page, format: "r8" | "r16f" | "r32f") => {
  await page.goto("/");
  await page.waitForFunction(() => (window as Win).__frapx !== undefined);
  await page.evaluate(
    async ({ fragment, format }) => {
      // Voxel i holds i / 32, exact in every format's precision.
      const values = Array.from({ length: 24 }, (_, i) => i / 32);
      const toHalf = (value: number) => {
        if (value === 0) return 0;
        const exponent = Math.floor(Math.log2(value));
        const mantissa = Math.round((value / 2 ** exponent - 1) * 1024);
        return ((exponent + 15) << 10) | mantissa;
      };
      const data =
        format === "r8"
          ? Uint8Array.from(values, (v) => Math.round(v * 255))
          : format === "r16f"
            ? Uint16Array.from(values, toHalf)
            : Float32Array.from(values);
      const fx = (window as Win).__frapx!.createShaderBackground({
        fragment,
        resolution: [4, 6],
        clock: "manual",
        pauseWhenOffscreen: false,
        textures: { volume: { data, size: [4, 3, 2], format, filter: "nearest" } }
      });
      (window as Win).__volume = fx;
      await fx.ready;
    },
    { fragment, format }
  );
};

// Red per voxel in x-fastest order, plus the size channels of the first pixel.
const readVolume = (page: Page) =>
  page.evaluate(async () => {
    const data = await (window as Win).__volume!.captureFrame({ format: "rgba8" });
    const voxels: number[] = [];
    // The capture is top row first; voxel rows start at the bottom.
    for (let row = 5; row >= 0; row -= 1) {
      for (let x = 0; x < 4; x += 1) voxels.push(data[(row * 4 + x) * 4]!);
    }
    const last = (5 * 4) * 4;
    return { voxels, size: [data[last + 1]!, data[last + 2]!] };
  });

const expected = Array.from({ length: 24 }, (_, i) => Math.round((i / 32) * 255));

for (const format of ["r8", "r16f", "r32f"] as const) {
  test(`samples a ${format} 3D data texture voxel by voxel`, async ({ page }) => {
    await open(page, format);
    expect(await page.evaluate(() => (window as Win).__volume!.status)).not.toBe("error");

    const { voxels, size } = await readVolume(page);
    voxels.forEach((value, i) => expect(Math.abs(value - expected[i]!)).toBeLessThanOrEqual(1));
    expect(size).toEqual([Math.round((3 / 8) * 255), Math.round((2 / 8) * 255)]);
  });
}

test("re-uploads a 3D data texture after a context restore", async ({ page }) => {
  await open(page, "r16f");
  const before = await readVolume(page);

  await page.evaluate(async () => {
    const fx = (window as Win).__volume!;
    const extension = fx.gl!.getExtension("WEBGL_lose_context")!;
    await new Promise<void>((resolve) => {
      fx.canvas!.addEventListener("webglcontextlost", () => resolve(), { once: true });
      extension.loseContext();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    extension.restoreContext();
  });
  await page.waitForFunction(() => {
    const status = (window as Win).__volume!.status;
    return status !== "context-lost" && status !== "loading";
  });

  expect(await page.evaluate(() => (window as Win).__volume!.status)).not.toBe("error");
  expect(await readVolume(page)).toEqual(before);
});
