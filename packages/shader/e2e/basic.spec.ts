import { expect, test } from "@playwright/test";

test("renders a non-empty shader canvas", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("[data-frapx-shader-canvas]");
  await expect(canvas).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __frapxShaderSample?: { frames: number; pixel: number[] | null };
            }
          ).__frapxShaderSample?.frames ?? 0
      )
    )
    .toBeGreaterThan(0);

  const sample = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __frapxShaderSample?: { frames: number; pixel: number[] | null };
        }
      ).__frapxShaderSample?.pixel
  );

  expect(sample).not.toBeNull();
  expect(sample!.some((value) => value > 0)).toBe(true);
});
