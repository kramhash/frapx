# @frapx/fx-canvas

[![npm version](https://img.shields.io/npm/v/@frapx/fx-canvas.svg)](https://www.npmjs.com/package/@frapx/fx-canvas)

<p align="center">
  <a href="https://github.com/kramhash/frapx/tree/main/examples/vite-liminal-vein">
    <picture>
      <source srcset="https://raw.githubusercontent.com/kramhash/frapx/main/assets/readme/liminal-vein.avif" type="image/avif">
      <img src="https://raw.githubusercontent.com/kramhash/frapx/main/assets/readme/liminal-vein.jpg" width="880" alt="LIMINAL VEIN: a dark tunnel lit by cyan rings that change from circles to hexagons and stars, with a thin violet streak">
    </picture>
  </a>
  <br>
  <sub><b>LIMINAL VEIN</b> — made with frapx (<code>@frapx/fx-passes</code>, rendered offline with <code>@frapx/tool-render</code>).</sub>
</p>

**Put the GLSL you wrote on a production website.** `@frapx/fx-canvas` runs your fragment shader behind any element in about 11 kB (min+gzip, including `@frapx/core`) and handles what bites in production: pausing offscreen and in hidden tabs, reduced motion, SSR-safe imports, and WebGL1 as well as WebGL2.

**Try it:** [Live demo](https://kramhash.github.io/frapx/live-demo/) · [Getting started](https://kramhash.github.io/frapx/getting-started/) · [Documentation](https://kramhash.github.io/frapx/)

## Install

```sh
pnpm add @frapx/fx-canvas
```

## Basic Usage

```ts
import { createShaderBackground, glsl } from "@frapx/fx-canvas";

const fx = createShaderBackground({
  target: ".hero",
  fragment: glsl`
    precision highp float;

    uniform vec2 u_resolution;
    uniform vec2 u_pointerUv;
    uniform float u_time;

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float glow = 0.5 + 0.5 * sin(u_time + uv.x * 8.0);
      gl_FragColor = vec4(uv.x, u_pointerUv.y, glow, 1.0);
    }
  `
});
```

JS uniform names omit `u_`; GLSL uniforms use `u_`.

```ts
fx.setUniform("progress", 0.4);
// GLSL: uniform float u_progress;
```

This naming rule also applies to initial custom uniforms:

```ts
createShaderBackground({
  target: ".hero",
  fragment,
  uniforms: {
    progress: 0
  }
});
```

The shader must declare `uniform float u_progress;`, not `uniform float progress;`.
Uniforms set before `ready` are cached and applied on the first render.

## Examples

- `examples/vite-basic` - minimal Vite usage and integration checks.
- `examples/vite-feedback` - interactive previous-frame feedback demo.
- `examples/vite-capture` - raymarched scene exported as a 4K PNG sequence with `clock: "manual"`, `captureFrame()` and `@frapx/tool-capture`.
- `examples/vite-react` - React binding example.

## Color Uniforms

Use `hexToRgb()` and `hexToRgba()` to convert hex colors into `vec3` and `vec4` uniform values.

```ts
import { createShaderBackground, glsl, hexToRgb, hexToRgba } from "@frapx/fx-canvas";

const fx = createShaderBackground({
  target: ".hero",
  fragment,
  uniforms: {
    baseColor: hexToRgb("#7dd3fc"),
    overlayColor: hexToRgba("#0f172acc")
  }
});
```

```glsl
uniform vec3 u_baseColor;
uniform vec4 u_overlayColor;
```

The helpers support `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, and the same forms without `#`.
The returned values are sRGB channels normalized to `0..1`. Invalid hex values throw an `Error`.

## Textures

```ts
const fx = createShaderBackground({
  target: ".hero",
  fragment,
  textures: {
    image: "/hero.webp",
    mask: {
      source: "/mask.webp",
      wrap: "clamp",
      filter: "linear",
      flipY: true
    }
  }
});
```

Each texture creates a sampler and size uniform:

```glsl
uniform sampler2D u_image;
uniform vec2 u_imageSize;
```

Supported v1 sources are image URL, `HTMLImageElement`, and `HTMLCanvasElement`.

Textures can be updated at runtime. Updates are async because URL sources must
load before they can be uploaded to WebGL.

```ts
await fx.setTexture("image", "/next-hero.webp");

await fx.setTextures({
  image: "/next-hero.webp",
  mask: nextMaskCanvas
});
```

`setTextures()` is a partial update: omitted texture names are left unchanged.
If a runtime texture update fails, the previous texture remains active and the
returned promise rejects. In `"demand"` render mode, successful texture updates
request a render.

## Feedback

Enable feedback when a shader needs to read the previous rendered frame:

```ts
createShaderBackground({
  target: ".hero",
  fragment,
  feedback: true
});
```

This creates a managed ping-pong framebuffer pair and exposes the previous rendered frame as a sampler:

```glsl
uniform vec2 u_resolution;
uniform sampler2D u_previousFrame;
uniform vec2 u_previousFrameSize;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec4 history = texture2D(u_previousFrame, uv);
  gl_FragColor = mix(vec4(0.0), history, 0.96);
}
```

For GLSL ES 3.00 shaders, use the same uniform names with `texture()`:

```glsl
#version 300 es
precision highp float;

out vec4 fragColor;
uniform vec2 u_resolution;
uniform sampler2D u_previousFrame;
uniform vec2 u_previousFrameSize;

void main() {
  fragColor = texture(u_previousFrame, gl_FragCoord.xy / u_resolution);
}
```

`feedback: true` uses `u_previousFrame` and `u_previousFrameSize`. To customize the generated suffix name:

```ts
feedback: {
  uniform: "history",
  filter: "linear",
  wrap: "clamp",
  clearColor: [0, 0, 0, 0]
}
```

The suffix must be a valid GLSL identifier without the `u_` prefix. For example, `uniform: "history"` creates `u_history` and `u_historySize`. A user texture with the same name is rejected.

The feedback texture always follows the canvas drawing-buffer size, and `u_previousFrameSize` reports that size in pixels. The first frame and any resize reset the texture to `clearColor` (transparent black by default). Alpha is preserved from the fragment output; the texture represents shader output before DOM compositing.

### Float feedback

8-bit feedback rounds away small increments (anything under 1/255 per frame) and clamps to 0–1. Request half-float buffers for accumulation or HDR history:

```ts
createShaderBackground({
  target: ".hero",
  fragment,
  feedback: { format: "rgba16f" } // default "rgba8"; `feedback: true` stays rgba8
});
```

- `rgba16f` needs WebGL2 with `EXT_color_buffer_float`. It requests a WebGL2 context even for GLSL ES 1.00 shaders (WebGL2 accepts them) and falls back to WebGL1 when unavailable.
- When float buffers are unsupported, the default warns and allocates `rgba8`. Pass `formatFallback: false` to fail initialization with `UnsupportedError` instead. `fx.feedbackFormat` reports the format actually allocated.
- The visible canvas is still 8-bit; the float history lives in the feedback buffers and can be read with `captureFrame({ format: "rgba16f" })`.
- `fx.resetFeedback()` clears both buffers to `clearColor` so the next frame starts from an empty history (it re-renders in demand mode, otherwise it does not draw).

In `renderMode: "demand"`, `u_previousFrame` is the result of the previous demand render. Enabling feedback does not start a continuous render loop by itself.

When feedback is enabled, `onBeforeRender` and `onAfterRender` wrap the main shader draw into the internal framebuffer. The copy to the visible canvas happens after `onAfterRender`.

See `examples/vite-feedback` for a small interactive feedback demo.

## External Uniforms

Scroll is intentionally not built in. Use any scroll or animation library and push values into uniforms.

```ts
const fx = createShaderBackground({
  target: ".hero",
  fragment,
  uniforms: {
    progress: 0,
    velocity: 0
  },
  renderMode: "demand"
});

window.addEventListener("scroll", () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  fx.setUniform("progress", max > 0 ? scrollY / max : 0);
});
```

## Timelines

`bindUniforms(source)` drives uniforms from anything with a `get(time)` method. It runs before every draw with the same time as `u_time` (the `setTime()` value under a manual clock), so keyframed values stay in step with exported frames. Bound values override `setUniform()` for the same names, a later source wins over an earlier one, and the returned function removes the binding.

`keyframes()` is a small, dependency-free source. Floats and vec2–vec4 tuples interpolate per component; keys may come in any order, and times outside them hold the end values:

```ts
import { createShaderBackground, keyframes } from "@frapx/fx-canvas";

fx.bindUniforms(
  keyframes(
    {
      camPos: [[0, [0, 1, 6]], [4, [3, 1.5, 2]]],
      glow: { keys: [[0, 0], [1, 1], [4, 0]], ease: "smooth" }
    },
    { ease: "linear" } // default for tracks without their own: "linear" | "smooth" | "step" | (t) => number
  )
);
```

A timeline library needs only a thin adapter. For example, with Theatre.js (a sketch, not tested in this repository):

```ts
const camera = sheet.object("Camera", { x: 0, y: 1, z: 6 });
fx.bindUniforms({
  get(time) {
    sheet.sequence.position = time;
    const { x, y, z } = camera.value;
    return { camPos: [x, y, z] };
  }
});
```

In `@frapx/fx-passes`, accumulating passes evaluate the source for every sample at the sample's time, so keyframed motion is motion blurred like `u_time`.

## Render Modes

```ts
createShaderBackground({
  target: ".hero",
  fragment,
  renderMode: "always" // default
});
```

`"demand"` renders when uniforms, pointer state, texture load, or resize changes. `fx.render()` is also available.

## Deterministic Rendering

For frame-accurate output (for example rendering a sequence for video), switch to a manual clock and, if needed, a fixed resolution:

```ts
const fx = createShaderBackground({
  target: ".stage",
  fragment,
  clock: "manual",          // no animation loop; default "realtime"
  resolution: [3840, 2160]  // fixed u_resolution; letterboxed into .stage
});
await fx.ready;

for (let frame = 0; frame < 120; frame += 1) {
  fx.setTime(frame / 60); // u_time; u_delta = difference from the previous call
  const png = await fx.captureFrame(); // draws this frame and encodes it
  // save png (a Blob) somewhere
}
```

- With `clock: "manual"`, nothing renders on its own: `setTime()` only sets the time and `render()` draws. Offscreen / hidden / reduced-motion pausing is bypassed, and `u_pointer*` and `u_reducedMotion` stay at 0, so the same time and uniforms always produce the same pixels. Pass any interactive values explicitly with `setUniform()`.
- `setClock("manual" | "realtime")` switches clocks after creation — preview in realtime, then switch to manual to render. Returning to realtime resumes the loop if the instance was started. In realtime, `setTime()` seeks the running clock.
- `resolution` decouples the drawing buffer from the target size. The canvas uses `object-fit: contain`, `u_viewportSize` stays the displayed CSS size and `u_pixelRatio` becomes internal px per CSS px; `dpr` / `maxDpr` are ignored. `setResolution([w, h])` changes it at runtime and `setResolution(null)` follows the target again (both reset feedback buffers, like any resize). Sizes above the GPU's limits throw / fail with `UnsupportedError`.
- Omit both `target` and `canvas` while passing `resolution` to render into a detached canvas that is never inserted into the page (`fx.canvas` gives you the element).
- The drawing buffer is not preserved between frames, so read pixels in the same task as `render()` (or in `onAfterRender`) — or use `captureFrame()`, which does that for you.

### Following an audio transport

To keep a realtime shader in step with audio (or any transport that knows its position), pass `timeSource`. Every animation frame then takes `u_time` from it:

```ts
const fx = createShaderBackground({
  target: ".hero",
  fragment,
  respectReducedMotion: true,
  timeSource: () => transport.getPositionMs() / 1000 // seconds
});
```

- `u_time` is the source's value as is. `u_delta` is the step from the previous frame, clamped to 0.1 s. It is 0 when the source goes back (a seek or a loop) and on the first frame after a pause.
- Unlike `clock: "manual"`, the gates keep working: offscreen and hidden stop drawing (the first frame after resuming reads the source again, so it is current), reduced motion holds a still frame at the source's time, and `u_pointer*` / `u_reducedMotion` behave as in realtime. Seeks, pauses and loops of the transport are followed because the time is read, not counted.
- `render()` and `captureFrame()` redraw at the last frame's time. A source that returns a non-finite value holds the previous time.
- Only the animation frame loop reads the source, so `renderMode: "demand"` (which runs no loop) ignores it; call `setTime()` there. `debug: true` warns about it.
- `setTimeSource(fn | null)` changes or removes it at runtime; removing it continues from the source's last time. A manual clock ignores the source but keeps it, so switching to manual to export and back restores it.

Do not align a plain realtime clock once with `setTime()` when playback starts. The realtime clock counts animation frame timestamps, not the transport, so it drifts: it starts 30–40 ms off, and when the audio loop is shorter than the visual loop the gap grows on every loop. It cannot follow seeks or pauses either. Following the transport every frame keeps it within a frame.

### Capturing frames

`captureFrame()` draws a frame and reads it back in the same task, so it never depends on `preserveDrawingBuffer`:

```ts
const png = await fx.captureFrame();                        // Blob (default "png")
const rgba = await fx.captureFrame({ format: "rgba8" });    // Uint8Array
const hdr = await fx.captureFrame({ format: "rgba16f" });   // Float32Array
```

- Raw formats are RGBA, top row first (WebGL's bottom-up rows are flipped), at the drawing-buffer size.
- Each call draws one frame like `render()` — it advances feedback — but it also draws while paused, offscreen or hidden. It waits for `ready` first.
- `"rgba16f"` reads the float feedback buffer and rejects with `UnsupportedError` unless `fx.feedbackFormat === "rgba16f"`.
- `"png"` encodes what the canvas shows (`canvas.toBlob`); `"rgba8"` returns the raw shader output, which differs from the PNG only where alpha is below 1.

## Built-In Uniforms

```glsl
uniform vec2 u_resolution;     // drawing buffer px
uniform vec2 u_viewportSize;   // CSS px
uniform float u_pixelRatio;
uniform float u_time;          // seconds, paused offscreen/hidden (manual clock: set by setTime; timeSource: its value)
uniform float u_delta;         // seconds, clamped to 0.1 (manual clock: not clamped)
uniform vec2 u_pointer;        // drawing buffer px, bottom-left origin
uniform vec2 u_pointerUv;      // 0..1, bottom-left origin
uniform float u_pointerActive; // 0 or 1
uniform float u_reducedMotion; // 1 when the OS prefers reduced motion, else 0
```

`u_reducedMotion` is always supplied. Use it to soften or stop motion yourself when you do not want the library to pause the loop (see `respectReducedMotion` below).

## Options

```ts
createShaderBackground({
  target: ".hero",
  canvas: existingCanvas,
  fragment,
  vertex,
  uniforms,
  textures,
  feedback: false,
  layer: "background",
  autoStart: true,
  pauseWhenOffscreen: true,
  pauseWhenHidden: true,
  respectReducedMotion: false,
  renderMode: "always",
  clock: "realtime",
  // timeSource: () => audio.currentTime,
  // resolution: [1920, 1080],
  dpr: "auto",
  maxDpr: 2,
  autoResize: true,
  debug: false,
  canvasClass: "hero-fx",
  canvasStyle: {
    opacity: "0.8",
    mixBlendMode: "screen"
  },
  onReady(instance) {},
  onError(error) {},
  onBeforeRender(state) {},
  onAfterRender(state) {},
  onResize(state) {}
});
```

`onResize(state)` is called with the same `RenderState` as the render hooks whenever the render size actually changes: not on setup, nor every frame, but also after `setResolution()`. A resize requested during `captureFrame()` waits until the capture ends.

`layer: "background"` inserts the canvas as the first child with `z-index: 0`. `layer: "overlay"` inserts it as the last child with `z-index: 1`. Existing child styles are not changed.

### Lifecycle & accessibility

The render loop is paused whenever it is not worth running, and resumes automatically:

- `pauseWhenOffscreen` (default `true`) — pause while the target scrolls out of view.
- `pauseWhenHidden` (default `true`) — pause while the document is hidden (e.g. a background tab).
- `respectReducedMotion` (default `false`) — when enabled, hold a single static frame while the OS "prefers reduced motion" setting is on, and resume if the user turns it off. The `u_reducedMotion` uniform and `state.reducedMotion` are supplied regardless of this flag, so you can also handle reduced motion inside the shader. In `renderMode: "demand"` the motion gate does not apply (there is no loop to throttle).

### WebGL2 / GLSL ES 3.00

Start your fragment shader with `#version 300 es` and the library automatically requests a WebGL2 context:

```glsl
#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;

void main() {
  fragColor = vec4(v_uv, abs(sin(u_time)), 1.0);
}
```

The internal vertex shader switches to a `#version 300 es` / `in`/`out` variant automatically. The `v_uv` varying name is the same as in WebGL1. **You are responsible for writing `precision`, `in vec2 v_uv;`, and `out vec4`** — the library does not inject any preamble.

If WebGL2 is unavailable on the device, the instance transitions to `status: "unsupported"` and `onError` receives an `UnsupportedError`. No automatic downgrade is attempted.

Shaders without `#version 300 es` continue to use WebGL1 exactly as before.

## Instance API

```ts
fx.ready;
fx.clock; // "realtime" | "manual"
fx.time; // current time in seconds; the last sampled value with a timeSource
fx.start();
fx.stop();
fx.render();
fx.resize();
fx.destroy();
fx.setTime(2.5);
fx.setClock("manual");
fx.setTimeSource(() => audio.currentTime); // or null for animation frame time
fx.setResolution([1920, 1080]); // or null to follow the target
await fx.captureFrame({ format: "png" });
fx.feedbackFormat; // "rgba8" | "rgba16f" | null
fx.resetFeedback();
fx.setFragment(nextFragment); // ShaderCompileError | null
const unbind = fx.bindUniforms(keyframes({ glow: [[0, 0], [2, 1]] }));
await fx.setTexture("image", "/next-hero.webp");
await fx.setTextures({ image: "/next-hero.webp" });
fx.setUniform("progress", 0.5);
fx.setUniforms({ progress: 0.5, color: [1, 0, 0] });
```

Unsupported environments return a no-op instance. `ready` rejects and `debug: true` prints warnings.

`ready` resolves once the first setup finishes. It rejects with `DestroyedError` when `destroy()` runs first, with `UnsupportedError` when WebGL (or a feature the instance needs) is unavailable, and with the setup error, such as a `ShaderCompileError`, when initialization fails. Leaving `ready` unawaited after `destroy()` or in an unsupported environment does not produce an unhandled rejection, so a React StrictMode effect that destroys the instance in cleanup stays quiet. Setup failures and a missing target still surface as unhandled rejections when `ready` is left unhandled, even with `onError`.

### Hot reloading

`setFragment(source)` swaps the fragment shader without recreating the instance: the time, uniforms, textures and feedback history carry over (call `resetFeedback()` to clear the history). A compile error never throws. It is returned and passed to `onError`, and the previous shader keeps drawing, so a typo mid-edit does not blank the page:

```ts
import { fragment } from "./scene.glsl";

if (import.meta.hot) {
  import.meta.hot.accept("./scene.glsl", (module) => {
    if (fx.status === "error") return import.meta.hot!.invalidate(); // the first shader never compiled
    const error = module && fx.setFragment(module.fragment);
    if (error) console.error(error.lines);
  });
}
```

`ShaderCompileError.lines` lists the errors the driver located: `{ line, message, source, context }`, where `line` counts lines of the compiled source (after `glsl` interpolation) and `context` holds two lines either side. `stage` says whether the vertex or fragment shader failed. `@frapx/tool-dev`'s `createErrorOverlay()` shows them on the page.

`setFragment()` returns an error instead of swapping for an instance whose first shader failed (`status: "error"`; create a new one) and for a GLSL ES 3.00 shader on an instance that runs on WebGL1. It re-renders in demand mode; otherwise the next frame shows the new shader.

## GLSL Helpers

```ts
import { glsl, glslUtils } from "@frapx/fx-canvas/glsl";

const fragment = glsl`
precision highp float;
${glslUtils.coverUv}

uniform vec2 u_resolution;
uniform vec2 u_imageSize;
uniform sampler2D u_image;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  gl_FragColor = texture2D(u_image, coverUv(uv, u_resolution, u_imageSize));
}
`;
```

## Scope

`@frapx/fx-canvas` creates and manages a WebGL canvas for an existing DOM region, then lets you drive fragment shaders with built-in uniforms, custom uniforms, textures, and optional previous-frame feedback. It is not a scene, camera, mesh, or full rendering-engine abstraction.

## SSR Notes

The package is safe to import during SSR. Calling `createShaderBackground()` without a browser returns a no-op instance whose `ready` promise rejects.

## Browser Support

Shaders without `#version 300 es` use WebGL1 / GLSL ES 1.00. Shaders that start with `#version 300 es` request WebGL2 / GLSL ES 3.00 automatically. WebGL2 support is additive and does not change the WebGL1 default path.

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).
