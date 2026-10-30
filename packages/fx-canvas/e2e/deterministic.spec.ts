import { expect, test, type Page } from "@playwright/test";

type Instance = {
  status: string;
  ready: Promise<void>;
  canvas: HTMLCanvasElement | null;
  setTime(seconds: number): void;
  setClock(clock: "realtime" | "manual"): void;
  render(): void;
};

type Win = typeof window & {
  __frapxShader?: Instance;
  __frapxShaderSample?: { frames: number; pixel: number[] | null };
  __frapxTransportTime?: number;
};

// Draw and read back in the same task: the drawing buffer is not preserved,
// so pixels are only guaranteed until the browser composites the frame.
const renderAt = (page: Page, seconds: number) =>
  page.evaluate((time) => {
    const fx = (window as Win).__frapxShader!;
    fx.setTime(time);
    fx.render();
    return fx.canvas!.toDataURL("image/png");
  }, seconds);

const waitReady = (page: Page) =>
  page.evaluate(async () => {
    await (window as Win).__frapxShader!.ready;
  });

const frames = (page: Page) =>
  page.evaluate(() => (window as Win).__frapxShaderSample?.frames ?? 0);

for (const webgl2 of [false, true]) {
  test(`renders identical pixels for the same time (${webgl2 ? "WebGL2" : "WebGL1"})`, async ({
    page
  }) => {
    await page.goto(`/?clock=manual&res=320x180${webgl2 ? "&webgl2=1" : ""}`);
    await waitReady(page);

    const first = await renderAt(page, 1.5);
    const other = await renderAt(page, 3);
    const again = await renderAt(page, 1.5);

    expect(again).toBe(first);
    expect(other).not.toBe(first);

    // Pointer input must not leak into a manual-clock frame.
    await page.mouse.move(100, 100);
    await page.mouse.move(160, 120);
    expect(await renderAt(page, 1.5)).toBe(first);
  });
}

test("does not animate on its own under a manual clock", async ({ page }) => {
  await page.goto("/?clock=manual");
  await waitReady(page);

  const before = await frames(page);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(before);
});

test("keeps the internal resolution when the viewport changes", async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?clock=manual&res=640x360");
  await waitReady(page);
  await renderAt(page, 0);

  await page.setViewportSize({ width: 600, height: 900 });
  await renderAt(page, 0);

  const size = await page.evaluate(() => {
    const canvas = (window as Win).__frapxShader!.canvas!;
    return {
      width: canvas.width,
      height: canvas.height,
      objectFit: getComputedStyle(canvas).objectFit
    };
  });
  expect(size).toEqual({ width: 640, height: 360, objectFit: "contain" });
});

test("renders while the tab is hidden under a manual clock", async ({ page }) => {
  await page.goto("/?clock=manual");
  await waitReady(page);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  const before = await frames(page);
  await renderAt(page, 2);
  expect(await frames(page)).toBe(before + 1);
});

test("returns to the animation loop with setClock('realtime')", async ({
  page
}) => {
  await page.goto("/?clock=manual");
  await waitReady(page);
  expect(await page.evaluate(() => (window as Win).__frapxShader!.status)).toBe(
    "paused"
  );

  await page.evaluate(() => (window as Win).__frapxShader!.setClock("realtime"));

  await expect
    .poll(() => page.evaluate(() => (window as Win).__frapxShader!.status))
    .toBe("running");
  const before = await frames(page);
  await expect.poll(() => frames(page)).toBeGreaterThan(before);
});

const setTransportTime = (page: Page, seconds: number) =>
  page.evaluate((time) => {
    (window as Win).__frapxTransportTime = time;
  }, seconds);

const pixel = (page: Page) =>
  page.evaluate(() => (window as Win).__frapxShaderSample?.pixel ?? null);

const status = (page: Page) =>
  page.evaluate(() => (window as Win).__frapxShader!.status);

test("follows an external time source on every frame", async ({ page }) => {
  await page.goto("/?timeSource=1");
  await setTransportTime(page, 1.5);
  await waitReady(page);

  // The source holds still, so the loop keeps drawing the same frame.
  let before = await frames(page);
  await expect.poll(() => frames(page)).toBeGreaterThan(before + 2);
  const held = await pixel(page);
  before = await frames(page);
  await expect.poll(() => frames(page)).toBeGreaterThan(before + 2);
  expect(await pixel(page)).toEqual(held);

  await setTransportTime(page, 4);
  await expect.poll(() => pixel(page)).not.toEqual(held);
});

test("pauses drawing while hidden with a time source", async ({ page }) => {
  await page.goto("/?timeSource=1");
  await waitReady(page);
  await expect.poll(() => status(page)).toBe("running");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => status(page)).toBe("paused");

  const before = await frames(page);
  await setTransportTime(page, 3);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(before);
});

test("holds a frame under reduced motion with a time source", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?timeSource=1");
  await waitReady(page);
  await expect.poll(() => status(page)).toBe("paused");

  const before = await frames(page);
  await setTransportTime(page, 2);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(before);
});
