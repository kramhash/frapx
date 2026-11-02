import { expect, test, type Page } from "@playwright/test";

// The five checks of growth plan Phase 2. Shaders here are static (no
// u_time) so two screenshots of the preview differ only when the change under
// test changed the picture.

const PLAYGROUND = "/frapx/playground/";

const flat = (color: string, extra = "") => `precision highp float;
uniform float u_level; // @range 0 1 @default 0.2
${extra}
void main() {
  gl_FragColor = vec4(${color}, 1.0);
}
`;

const setSource = async (page: Page, text: string) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(text);
  // Past the 250 ms debounce and the compile.
  await page.waitForTimeout(700);
};

const overlayVisible = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector("frapx-error-overlay")?.shadowRoot?.querySelector(".panel");
    return panel instanceof HTMLElement && !panel.hidden;
  });

const preview = (page: Page) => page.locator(".preview").screenshot();

test.beforeEach(async ({ page }) => {
  await page.goto(PLAYGROUND);
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".preview canvas").last()).toBeVisible();
});

test("the preview holds exactly one canvas under StrictMode", async ({ page }) => {
  // The dev server renders in StrictMode, which destroys the first preview
  // before its deferred init; that one must leave nothing behind (#109).
  await page.waitForTimeout(300);
  await expect(page.locator(".preview canvas")).toHaveCount(1);
});

test("an edit changes the preview", async ({ page }) => {
  await setSource(page, flat("vec3(1.0, 0.0, 0.0)"));
  const red = await preview(page);
  await setSource(page, flat("vec3(0.0, 0.0, 1.0)"));
  const blue = await preview(page);
  expect(red.equals(blue)).toBe(false);
  expect(await overlayVisible(page)).toBe(false);
});

test("an annotated uniform's slider changes the preview", async ({ page }) => {
  await setSource(page, flat("vec3(u_level)"));
  const before = await preview(page);
  await page.getByLabel("level", { exact: true }).fill("0.9");
  await page.waitForTimeout(200);
  const after = await preview(page);
  expect(before.equals(after)).toBe(false);
});

test("every install tab has code with the slider value baked in", async ({ page }) => {
  await setSource(page, flat("vec3(u_level)"));
  await page.getByLabel("level", { exact: true }).fill("0.9");
  const expected: Record<string, string> = {
    HTML: "https://cdn.jsdelivr.net/npm/@frapx/fx-canvas@",
    Vanilla: "createShaderBackground({",
    React: "<ShaderBackground",
    Astro: "<script>"
  };
  for (const [tab, marker] of Object.entries(expected)) {
    await page.getByRole("tab", { name: tab }).click();
    const code = page.locator("#install-code");
    await expect(code).toContainText(marker);
    await expect(code).toContainText("level: 0.9");
  }
});

test("reopening the share URL restores the source and slider values", async ({ page, context }) => {
  await setSource(page, flat("vec3(u_level, 0.5, 0.25)", "// shared marker"));
  await page.getByLabel("level", { exact: true }).fill("0.75");
  // The hash is written once the state has been still for 300 ms.
  await page.waitForTimeout(900);
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toMatch(/^#v1=/);

  const reopened = await context.newPage();
  await reopened.goto(`${PLAYGROUND}${hash}`);
  await expect(reopened.locator(".cm-content")).toContainText("// shared marker");
  await expect(reopened.getByLabel("level", { exact: true })).toHaveValue("0.75");
  await expect(reopened.locator(".topbar select").first()).toHaveValue("custom");
});

test("a compile error shows the overlay, and fixing it clears it", async ({ page }) => {
  await setSource(page, flat("vec3(1.0)", "float broken = ;"));
  await expect.poll(() => overlayVisible(page)).toBe(true);
  await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);
  await setSource(page, flat("vec3(1.0)"));
  await expect.poll(() => overlayVisible(page)).toBe(false);
});

test("a bad share link falls back to the default starter with a notice", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto(`${PLAYGROUND}#v1=not-a-real-link`);
  await expect(page.locator(".notice")).toBeVisible();
  await expect(page.locator(".topbar select").first()).toHaveValue("waves");
});

test("a share URL pasted into the open tab is restored", async ({ page, context }) => {
  await setSource(page, flat("vec3(u_level)", "// pasted marker"));
  await page.waitForTimeout(900);
  const hash = await page.evaluate(() => location.hash);

  const other = await context.newPage();
  await other.goto(PLAYGROUND);
  await expect(other.locator(".cm-content")).not.toContainText("// pasted marker");
  // Same document, new hash: what pasting a link into the address bar does.
  await other.evaluate((next) => {
    location.hash = next;
  }, hash);
  await expect(other.locator(".cm-content")).toContainText("// pasted marker");

  await other.evaluate(() => {
    location.hash = "#v1=broken";
  });
  await expect(other.locator(".notice")).toBeVisible();
  await expect(other.locator(".topbar select").first()).toHaveValue("waves");
});

test.describe("baked SDF volumes", () => {
  const pickBaked = async (page: Page) => {
    await page.locator(".topbar select").first().selectOption("baked-sdf");
    await expect(page.locator(".volume-pick select")).toHaveValue("suzanne");
    // The sample is fetched and decoded after the shader compiles.
    await expect(page.locator(".volume-note")).toHaveCount(0);
  };

  test("the Baked SDF starter renders the bundled sample", async ({ page }) => {
    await pickBaked(page);
    expect(await overlayVisible(page)).toBe(false);
  });

  test("opening a file loads the volume into the preview", async ({ page }) => {
    // A static slice through the volume: black until the file is loaded.
    await setSource(
      page,
      `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform highp sampler3D u_sdf; // @volume Copy.r8-zstd.sdf.ktx2
uniform vec3 u_sdfMin;
uniform vec3 u_sdfMax;
uniform float u_sdfScale;
uniform float u_sdfOffset;
out vec4 fragColor;
// @include sdfVolume
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution * 2.0 - 1.0;
  float d = frapx_sdVolume(u_sdf, vec3(uv * 1.5, 0.0), u_sdfMin, u_sdfMax, u_sdfScale, u_sdfOffset);
  fragColor = vec4(vec3(d < 0.0 ? 1.0 : 0.0), 1.0);
}
`
    );
    await expect(page.locator(".volume-note")).toContainText("Copy.r8-zstd.sdf.ktx2");
    const before = await preview(page);
    await page.locator('input[data-volume="sdf"]').setInputFiles("e2e/fixtures/Copy.r8-zstd.sdf.ktx2");
    await expect(page.locator(".volume-note")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect((await preview(page)).equals(before)).toBe(false);
    expect(await overlayVisible(page)).toBe(false);
  });

  test("opening a file rewrites @volume and the install code", async ({ page }) => {
    await pickBaked(page);
    await page.locator('input[data-volume="sdf"]').setInputFiles("e2e/fixtures/Copy.r8-zstd.sdf.ktx2");
    await expect(page.locator(".cm-content")).toContainText("// @volume Copy.r8-zstd.sdf.ktx2");
    await expect(page.locator(".volume-pick select")).toHaveValue("Copy.r8-zstd.sdf.ktx2");
    await expect(page.locator("#install-code")).toContainText('loadSdfVolume("./sdf/Copy.r8-zstd.sdf.ktx2"');
    expect(await overlayVisible(page)).toBe(false);
  });

  test("a share URL naming a local file asks for it", async ({ page, context }) => {
    await pickBaked(page);
    await page.locator('input[data-volume="sdf"]').setInputFiles("e2e/fixtures/Copy.r8-zstd.sdf.ktx2");
    await expect(page.locator(".cm-content")).toContainText("// @volume Copy.r8-zstd.sdf.ktx2");
    await page.waitForTimeout(900);
    const hash = await page.evaluate(() => location.hash);

    const other = await context.newPage();
    await other.goto(`${PLAYGROUND}${hash}`);
    await expect(other.locator(".volume-note")).toContainText("Copy.r8-zstd.sdf.ktx2");
    await other.getByRole("button", { name: "Use Suzanne" }).click();
    await expect(other.locator(".cm-content")).toContainText("// @volume suzanne");
    await expect(other.locator(".volume-note")).toHaveCount(0);
  });

  test("a share URL with a sample restores it", async ({ page, context }) => {
    await pickBaked(page);
    await page.waitForTimeout(900);
    const hash = await page.evaluate(() => location.hash);
    const other = await context.newPage();
    await other.goto(`${PLAYGROUND}${hash}`);
    await expect(other.locator(".volume-pick select")).toHaveValue("suzanne");
    await expect(other.locator(".volume-note")).toHaveCount(0);
  });
});

test("switching from Baked SDF to a GLSL ES 1.00 starter and back works", async ({ page }) => {
  await page.locator(".topbar select").first().selectOption("baked-sdf");
  await expect(page.locator(".volume-pick select")).toHaveValue("suzanne");
  await expect(page.locator(".volume-note")).toHaveCount(0);
  // Waves is GLSL ES 1.00: the preview is recreated on WebGL1, where the
  // previous shader's 3D volume must not be passed along.
  await page.locator(".topbar select").first().selectOption("waves");
  await page.waitForTimeout(800);
  expect(await overlayVisible(page)).toBe(false);
  await page.locator(".topbar select").first().selectOption("baked-sdf");
  await expect(page.locator(".volume-note")).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await overlayVisible(page)).toBe(false);
});
