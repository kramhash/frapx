import { expect, test } from "@playwright/test";

type Win = typeof window & {
  __frapxShader?: { status: string };
  __frapxShaderSample?: { frames: number };
};

const status = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as Win).__frapxShader?.status ?? "");

const frames = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as Win).__frapxShaderSample?.frames ?? 0);

test("holds a static frame under prefers-reduced-motion, then resumes", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?reducedMotion=1");

  await expect.poll(() => status(page)).toBe("paused");

  // A single static frame was drawn, the loop is not advancing.
  const frozen = await frames(page);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(frozen);

  // Turning the OS setting off at runtime resumes the animation.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => status(page)).toBe("running");
  await expect.poll(() => frames(page)).toBeGreaterThan(frozen);
});

test("pauses while the tab is hidden, resumes when visible", async ({
  page
}) => {
  await page.goto("/");
  await expect.poll(() => status(page)).toBe("running");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => status(page)).toBe("paused");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => status(page)).toBe("running");
});
