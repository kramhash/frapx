import { expect, test, type Page } from "@playwright/test";
import type { ParticlesHandle } from "../src";

type Win = typeof window & {
  __frapxParticles?: { current: ParticlesHandle | null };
};

const open = async (page: Page) => {
  await page.goto("/");
  await page.waitForFunction(
    () => (window as Win).__frapxParticles?.current?.getInstance()?.status === "running"
  );
};

// Marks the current particle canvas, so a recreated instance shows up as an
// unmarked one.
const mark = (page: Page) =>
  page.evaluate(() => {
    document.querySelector<HTMLCanvasElement>("[data-testid=particles] canvas")!.dataset.mark = "1";
  });

const state = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=particles] canvas");
    const instance = (window as Win).__frapxParticles!.current!.getInstance()!;
    return {
      marked: canvas?.dataset.mark === "1",
      pool: instance.maxParticles,
      status: instance.status
    };
  });

// Total alpha of the particle layer, a proxy for how much is drawn.
const coverage = (page: Page) =>
  page.evaluate(async () => {
    const pixels = await (window as Win).__frapxParticles!.current!.captureFrame({ format: "rgba8" });
    let sum = 0;
    for (let i = 3; i < pixels.length; i += 4) sum += pixels[i]!;
    return sum;
  });

const setRate = async (page: Page, rate: number) => {
  await page.getByRole("slider").fill(String(rate));
  await expect(page.getByText(`Rate: ${rate} / s`)).toBeVisible();
};

test("draws the preset into a transparent layer over the shader background", async ({ page }) => {
  await open(page);
  expect(await coverage(page)).toBeGreaterThan(0);
  await expect(page.locator("canvas")).toHaveCount(2);
});

test("a rate the pool holds applies in place; one it cannot recreates with a larger pool", async ({ page }) => {
  await open(page);
  // snow lives up to 24 s, so its automatic pool of 1200 holds 50 per second.
  expect((await state(page)).pool).toBe(1200);
  await mark(page);

  await setRate(page, 50);
  expect(await state(page)).toEqual({ marked: true, pool: 1200, status: "running" });

  await setRate(page, 51);
  await expect.poll(async () => (await state(page)).pool).toBe(1530);
  expect((await state(page)).marked).toBe(false);

  // Going back down stays on the larger pool.
  await mark(page);
  await setRate(page, 20);
  expect(await state(page)).toEqual({ marked: true, pool: 1530, status: "running" });
});

test("changing the preset recreates the instance", async ({ page }) => {
  await open(page);
  await mark(page);
  await page.getByRole("combobox", { name: "Preset" }).selectOption("confetti");
  await expect.poll(async () => (await state(page)).marked).toBe(false);
  expect((await state(page)).status).toBe("running");
});

test("uniformSources drives opacity while bound and hands it back when removed", async ({ page }) => {
  await open(page);
  const spread = async () => {
    const samples: number[] = [];
    for (let i = 0; i < 8; i++) {
      samples.push(await coverage(page));
      await page.waitForTimeout(500);
    }
    return Math.max(...samples) / Math.max(1, Math.min(...samples));
  };

  await mark(page);
  await page.getByRole("checkbox").check();
  // Opacity breathes between 1 and 0.15 every 4 s.
  expect(await spread()).toBeGreaterThan(2);

  await page.getByRole("checkbox").uncheck();
  expect(await spread()).toBeLessThan(1.5);
  expect((await state(page)).marked).toBe(true);
});

test("status follows the runtime, pausing under reduced motion", async ({ page }) => {
  await open(page);
  const readout = page.getByTestId("particles-status");
  await expect(readout).toHaveText("Status: running");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(readout).toHaveText("Status: paused");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(readout).toHaveText("Status: running");
});
