---
title: Getting Started
description: Install @frapx/fx-canvas and render your first shader background.
---

Most people only need one package: **[`@frapx/fx-canvas`](/frapx/packages/fx-canvas/)**.
It creates and manages a WebGL canvas over an existing DOM element and drives a
fragment shader you provide — no scene graph, no cameras, no meshes.

## Install

```sh
pnpm add @frapx/fx-canvas
```

## Render a shader background

```ts
import { createShaderBackground, glsl } from "@frapx/fx-canvas";

createShaderBackground({
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

`target` is any CSS selector or element. `@frapx/fx-canvas` inserts a canvas
into it, sizes it to match, and starts a render loop that supplies built-in
uniforms — `u_time`, `u_resolution`, `u_pointerUv`, and more (see the
[`@frapx/fx-canvas` reference](/frapx/packages/fx-canvas/)).

The render loop pauses automatically when the target scrolls offscreen or the
tab is hidden — you don't need to wire that up yourself. It also holds a
static frame under the OS "prefers reduced motion" setting
(`respectReducedMotion`, default `true`). Pass `respectReducedMotion: false` to
keep animating and respond to the `u_reducedMotion` uniform, which is always
supplied, inside the shader instead.

## Using React?

Add **[`@frapx/react-canvas`](/frapx/packages/react-canvas/)** and use the
`<ShaderBackground />` component instead of calling `createShaderBackground`
yourself:

```sh
pnpm add @frapx/fx-canvas @frapx/react-canvas
```

```tsx
import { ShaderBackground } from "@frapx/react-canvas";
import { glsl } from "@frapx/fx-canvas";

const fragment = glsl`
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
  }
`;

export function HeroBackground() {
  return <ShaderBackground fragment={fragment} className="hero-bg" />;
}
```

## Next steps

- See it running on this page: [Live Demo](/frapx/live-demo/).
- Add noise or flowmap distortion to your own shader: [`@frapx/glsl-noise`](/frapx/packages/glsl-noise/), [`@frapx/glsl-flowmap`](/frapx/packages/glsl-flowmap/).
- Not sure which package covers your use case? Check the [decision table](/frapx/#quick-decision-table) on the home page.
