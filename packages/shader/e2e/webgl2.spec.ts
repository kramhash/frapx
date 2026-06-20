import { expect, test } from "@playwright/test";

type FrapxWindow = typeof window & {
  __frapxShader?: { status: string };
  __frapxShaderSample?: { frames: number; pixel: number[] | null };
};

test("renders a non-empty shader canvas with GLSL ES 3.00 (WebGL2)", async ({ page }) => {
  await page.goto("/?webgl2=1");

  const canvas = page.locator("[data-frapx-shader-canvas]");
  await expect(canvas).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => (window as FrapxWindow).__frapxShader?.status))
    .toMatch(/^(ready|running)$/);

  await expect
    .poll(() =>
      page.evaluate(() => (window as FrapxWindow).__frapxShaderSample?.frames ?? 0)
    )
    .toBeGreaterThan(0);

  const sample = await page.evaluate(
    () => (window as FrapxWindow).__frapxShaderSample?.pixel
  );
  expect(sample).not.toBeNull();
  expect(sample!.some((value) => value > 0)).toBe(true);
});
