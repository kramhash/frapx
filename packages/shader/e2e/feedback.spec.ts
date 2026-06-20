import { expect, test } from "@playwright/test";

type FrapxWindow = typeof window & {
  __frapxShader?: { status: string };
  __frapxShaderSample?: { frames: number; pixel: number[] | null };
};

test("renders a feedback shader with previous-frame texture", async ({ page }) => {
  await page.goto("/?feedback=1");

  await expect
    .poll(() => page.evaluate(() => (window as FrapxWindow).__frapxShader?.status))
    .toMatch(/^(ready|running)$/);

  await expect
    .poll(() =>
      page.evaluate(() => (window as FrapxWindow).__frapxShaderSample?.frames ?? 0)
    )
    .toBeGreaterThan(1);

  const sample = await page.evaluate(
    () => (window as FrapxWindow).__frapxShaderSample?.pixel
  );
  expect(sample).not.toBeNull();
  expect(sample!.some((value) => value > 0)).toBe(true);
});

test("renders a feedback shader with GLSL ES 3.00", async ({ page }) => {
  await page.goto("/?webgl2=1&feedback=1");

  await expect
    .poll(() => page.evaluate(() => (window as FrapxWindow).__frapxShader?.status))
    .toMatch(/^(ready|running)$/);

  await expect
    .poll(() =>
      page.evaluate(() => (window as FrapxWindow).__frapxShaderSample?.frames ?? 0)
    )
    .toBeGreaterThan(1);

  const sample = await page.evaluate(
    () => (window as FrapxWindow).__frapxShaderSample?.pixel
  );
  expect(sample).not.toBeNull();
  expect(sample!.some((value) => value > 0)).toBe(true);
});
