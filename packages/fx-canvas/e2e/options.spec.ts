import { expect, test } from "@playwright/test";
import type { createShaderBackground, glsl, glslUtils } from "../src";

type Win = typeof window & {
  __frapx?: {
    createShaderBackground: typeof createShaderBackground;
    glsl: typeof glsl;
    glslUtils: typeof glslUtils;
  };
};

const solid = `precision mediump float;
void main() {
  gl_FragColor = vec4(1.0);
}
`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as Win).__frapx !== undefined);
});

test("inserts the canvas by layer and leaves existing children alone", async ({ page }) => {
  const result = await page.evaluate(async (fragment) => {
    const { createShaderBackground } = (window as Win).__frapx!;
    const place = async (layer: "background" | "overlay") => {
      const target = document.createElement("div");
      target.style.cssText = "width: 64px; height: 32px";
      const child = document.createElement("p");
      child.style.cssText = "margin: 0; z-index: 3";
      target.append(child);
      document.body.append(target);

      const fx = createShaderBackground({ target, fragment, layer });
      await fx.ready;
      const canvas = fx.canvas!;
      const placed = {
        first: target.firstElementChild === canvas,
        last: target.lastElementChild === canvas,
        zIndex: canvas.style.zIndex,
        marked: canvas.hasAttribute("data-frapx-canvas"),
        childStyle: child.style.cssText,
        position: target.style.position
      };
      fx.destroy();
      return { ...placed, positionAfterDestroy: target.style.position };
    };
    return { background: await place("background"), overlay: await place("overlay") };
  }, solid);

  expect(result.background).toMatchObject({ first: true, zIndex: "0", marked: true });
  expect(result.overlay).toMatchObject({ last: true, zIndex: "1", marked: true });
  for (const placed of [result.background, result.overlay]) {
    expect(placed.childStyle).toBe("margin: 0px; z-index: 3;");
    // A static target is made relative while the instance lives.
    expect(placed.position).toBe("relative");
    expect(placed.positionAfterDestroy).toBe("");
  }
});

test("applies canvasClass and canvasStyle after the library's own styles", async ({ page }) => {
  const result = await page.evaluate(async (fragment) => {
    const { createShaderBackground } = (window as Win).__frapx!;
    const target = document.createElement("div");
    target.style.cssText = "width: 64px; height: 32px";
    document.body.append(target);

    const fx = createShaderBackground({
      target,
      fragment,
      canvasClass: "hero-fx",
      canvasStyle: { opacity: "0.5", zIndex: "5" }
    });
    await fx.ready;
    const canvas = fx.canvas!;
    const styled = {
      hasClass: canvas.classList.contains("hero-fx"),
      opacity: canvas.style.opacity,
      zIndex: canvas.style.zIndex,
      position: canvas.style.position
    };
    fx.destroy();
    return styled;
  }, solid);

  expect(result).toEqual({ hasClass: true, opacity: "0.5", zIndex: "5", position: "absolute" });
});

test("marks a canvas passed with `canvas` without positioning it", async ({ page }) => {
  const result = await page.evaluate(async (fragment) => {
    const { createShaderBackground } = (window as Win).__frapx!;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width: 32px; height: 16px";
    document.body.append(canvas);

    const fx = createShaderBackground({ canvas, fragment });
    await fx.ready;
    const marked = {
      marked: canvas.hasAttribute("data-frapx-canvas"),
      position: canvas.style.position,
      selected: document.querySelectorAll("[data-frapx-canvas]").length
    };
    fx.destroy();
    return marked;
  }, solid);

  // The page's own instance plus this one.
  expect(result).toEqual({ marked: true, position: "", selected: 2 });
});

test("uses a numeric dpr as given, capped only by an explicit maxDpr", async ({ page }) => {
  const sizes = await page.evaluate(async (fragment) => {
    const { createShaderBackground } = (window as Win).__frapx!;
    const sizeWith = async (options: { dpr: number; maxDpr?: number }) => {
      const target = document.createElement("div");
      target.style.cssText = "width: 50px; height: 20px";
      document.body.append(target);
      const fx = createShaderBackground({ target, fragment, ...options });
      await fx.ready;
      const size = [fx.canvas!.width, fx.canvas!.height];
      fx.destroy();
      target.remove();
      return size;
    };
    return {
      capped: await sizeWith({ dpr: 3, maxDpr: 1.5 }),
      uncapped: await sizeWith({ dpr: 3 }),
      underCap: await sizeWith({ dpr: 1.5, maxDpr: 4 }),
      belowOne: await sizeWith({ dpr: 0.5 })
    };
  }, solid);

  expect(sizes.capped).toEqual([75, 30]);
  expect(sizes.uncapped).toEqual([150, 60]);
  expect(sizes.underCap).toEqual([75, 30]);
  expect(sizes.belowOne).toEqual([25, 10]);
});

for (const version of ["100", "300"] as const) {
  test(`compiles every glslUtils snippet in GLSL ES ${version === "100" ? "1.00" : "3.00"}`, async ({
    page
  }) => {
    const result = await page.evaluate(async (version) => {
      const { createShaderBackground, glsl, glslUtils } = (window as Win).__frapx!;
      const header =
        version === "300"
          ? "#version 300 es\nprecision highp float;\nout vec4 fragColor;\n"
          : "precision highp float;\n";
      const output = version === "300" ? "fragColor" : "gl_FragColor";
      // Red and green show where p * rotate2d(pi / 2) moves (1, 0); blue and
      // alpha only keep the other two snippets from being optimized out.
      const fragment = glsl`${header}
${glslUtils.coverUv}
${glslUtils.containUv}
${glslUtils.rotate2d}

void main() {
  vec2 p = vec2(1.0, 0.0) * rotate2d(1.5707963);
  vec2 cover = coverUv(vec2(0.5), vec2(2.0, 1.0), vec2(1.0));
  vec2 contain = containUv(vec2(0.5), vec2(2.0, 1.0), vec2(1.0));
  ${output} = vec4(p * 0.5 + 0.5, cover.x * contain.y, 1.0);
}
`;
      const fx = createShaderBackground({ fragment, clock: "manual", resolution: [4, 4] });
      try {
        await fx.ready;
        const pixel = await fx.captureFrame({ format: "rgba8" });
        return { status: fx.status, webgl2: fx.gl instanceof WebGL2RenderingContext, pixel: Array.from(pixel.slice(0, 4)) };
      } finally {
        fx.destroy();
      }
    }, version);

    expect(result.status).toBe("paused");
    expect(result.webgl2).toBe(version === "300");
    // (1, 0) turned counter-clockwise by 90 degrees is (0, 1).
    expect(result.pixel[0]).toBeGreaterThanOrEqual(127);
    expect(result.pixel[0]).toBeLessThanOrEqual(128);
    expect(result.pixel[1]).toBe(255);
    // Both fits keep the centre where it is: 0.5 * 0.5.
    expect(result.pixel[2]).toBeGreaterThanOrEqual(63);
    expect(result.pixel[2]).toBeLessThanOrEqual(64);
  });
}
