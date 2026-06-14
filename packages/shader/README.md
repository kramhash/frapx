# @frapx/shader

Lightweight WebGL1 shader background runtime for websites.

This is not a scene, camera, or mesh abstraction. It creates and manages a WebGL canvas for an existing DOM region, then lets you drive fragment shaders with built-in and custom uniforms.

## Install

```sh
pnpm add @frapx/shader
```

## Basic Usage

```ts
import { createShaderBackground, glsl } from "@frapx/shader";

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

## Color Uniforms

Use `hexToRgb()` and `hexToRgba()` to convert hex colors into `vec3` and `vec4` uniform values.

```ts
import { createShaderBackground, glsl, hexToRgb, hexToRgba } from "@frapx/shader";

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

## Render Modes

```ts
createShaderBackground({
  target: ".hero",
  fragment,
  renderMode: "always" // default
});
```

`"demand"` renders when uniforms, pointer state, texture load, or resize changes. `fx.render()` is also available.

## Built-In Uniforms

```glsl
uniform vec2 u_resolution;     // drawing buffer px
uniform vec2 u_viewportSize;   // CSS px
uniform float u_pixelRatio;
uniform float u_time;          // seconds, paused offscreen
uniform float u_delta;         // seconds, clamped to 0.1
uniform vec2 u_pointer;        // drawing buffer px, bottom-left origin
uniform vec2 u_pointerUv;      // 0..1, bottom-left origin
uniform float u_pointerActive; // 0 or 1
```

## Options

```ts
createShaderBackground({
  target: ".hero",
  canvas: existingCanvas,
  fragment,
  vertex,
  uniforms,
  textures,
  layer: "background",
  autoStart: true,
  pauseWhenOffscreen: true,
  renderMode: "always",
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
  onAfterRender(state) {}
});
```

`layer: "background"` inserts the canvas as the first child with `z-index: 0`. `layer: "overlay"` inserts it as the last child with `z-index: 1`. Existing child styles are not changed.

## Instance API

```ts
fx.ready;
fx.start();
fx.stop();
fx.render();
fx.resize();
fx.destroy();
fx.setUniform("progress", 0.5);
fx.setUniforms({ progress: 0.5, color: [1, 0, 0] });
```

Unsupported environments return a no-op instance. `ready` rejects and `debug: true` prints warnings.

## GLSL Helpers

```ts
import { glsl, glslUtils } from "@frapx/shader/glsl";

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

## SSR Notes

The package is safe to import during SSR. Calling `createShaderBackground()` without a browser returns a no-op instance whose `ready` promise rejects.

## Browser Support

v1 targets WebGL1 / GLSL ES 1.00. WebGL2-only shader syntax is out of scope.
