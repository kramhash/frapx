# frapx

<p align="center">
  <a href="./examples/vite-liminal-vein">
    <picture>
      <source srcset="./assets/readme/liminal-vein.avif" type="image/avif">
      <img src="./assets/readme/liminal-vein.jpg" width="880" alt="LIMINAL VEIN: a dark tunnel lit by cyan rings that change from circles to hexagons and stars, with a thin violet streak">
    </picture>
  </a>
  <br>
  <sub><b>LIMINAL VEIN</b> — a 15-second loop made with <code>@frapx/fx-passes</code> and rendered offline with <code>@frapx/tool-render</code>. <a href="./examples/vite-liminal-vein">Source</a></sub>
</p>

**Put the GLSL you wrote on a production website.** `@frapx/fx-canvas` runs your
fragment shader behind any element in about 11 kB (min+gzip, including
`@frapx/core`) and handles what bites in production: pausing offscreen and in
hidden tabs, reduced motion, SSR-safe imports, and WebGL1 as well as WebGL2.

frapx started from wanting a fragment shader on a page without shipping a 3D
engine. Here is the same full-screen shader with each:

| Library | min+gzip |
| --- | ---: |
| `@frapx/fx-canvas` | 11 kB |
| Babylon.js | 45 kB |
| three.js | 133 kB |

<sub>Measured 2026-10-30 · [how](https://github.com/kramhash/frapx-bench)</sub>

```sh
pnpm add @frapx/fx-canvas
```

```ts
import { createShaderBackground, glsl } from "@frapx/fx-canvas";

createShaderBackground({
  target: ".hero",
  fragment: glsl`
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
    }
  `
});
```

**Try it:** [Live demo](https://kramhash.github.io/frapx/live-demo/) ·
[Getting started](https://kramhash.github.io/frapx/getting-started/) ·
[Documentation](https://kramhash.github.io/frapx/)

## Packages

Start with `@frapx/fx-canvas`, then add the pieces you keep reusing — SDF,
noise, raymarching, flowmaps, multipass/FBO, GPU particles and frame export —
maintained together in this repository.

Packages are named by category, so the prefix tells you what kind of package it is:

**Effect runtimes** — instantiate directly in your app:
- [`@frapx/fx-canvas`](./packages/fx-canvas) - Create lightweight WebGL shader backgrounds for websites.
- [`@frapx/fx-passes`](./packages/fx-passes) - WebGL2 multipass runtime for video work: Shadertoy-style buffers, float outputs and deterministic sample accumulation for anti-aliasing and motion blur.
- [`@frapx/fx-particles`](./packages/fx-particles) - WebGL2 GPU particles for backgrounds (snow, dust, sparkles, confetti, ...), with deterministic fixed-step playback for frame export.

**Framework bindings** — for an effect runtime above:
- [`@frapx/react-canvas`](./packages/react-canvas) - React bindings for `@frapx/fx-canvas`.
- [`@frapx/react-particles`](./packages/react-particles) - React bindings for `@frapx/fx-particles`.

**GLSL snippets** — string-concatenate into your own fragment shader:
- [`@frapx/glsl-noise`](./packages/glsl-noise) - Lightweight GLSL 3D noise helpers.
- [`@frapx/glsl-flowmap`](./packages/glsl-flowmap) - GLSL flowmap decode/distortion helpers.
- [`@frapx/glsl-sdf`](./packages/glsl-sdf) - GLSL 2D/3D signed distance functions and operators.
- [`@frapx/glsl-raymarch`](./packages/glsl-raymarch) - GLSL raymarching loop, normals, soft shadows, ambient occlusion and camera rays.

**Tools** — export and production utilities built on the runtimes:
- [`@frapx/tool-capture`](./packages/tool-capture) - Deterministic PNG sequence export (8-bit or 16-bit) to a folder or a ZIP, in the browser.
- [`@frapx/tool-dev`](./packages/tool-dev) - Development helpers: an on-page overlay for shader compile errors while hot reloading with `setFragment()`.
- [`@frapx/tool-render`](./packages/tool-render) - `frapx-render` CLI: renders a page in headless Chrome to a resumable PNG sequence, with optional ProRes/H.264 encoding.

**Internal engine** — not installed directly; pulled in automatically as a dependency:
- [`@frapx/core`](./packages/core) - Shared WebGL runtime host used internally by `@frapx/fx-canvas`, `@frapx/fx-passes` and `@frapx/fx-particles`.

Not sure what you need? If you're adding an animated WebGL background, start with
`@frapx/fx-canvas` (or `@frapx/react-canvas` in a React app) and pull in a `glsl-*`
package only when you need its GLSL helpers inside your fragment shader.

## When to use something else

- **A 3D scene** — meshes, loaded models, lights, shadows or physics: use
  [three.js](https://threejs.org/) or [Babylon.js](https://www.babylonjs.com/).
  frapx draws fragment shaders over a full-screen quad; it is not a scene,
  camera, mesh or rendering-engine abstraction (3D inside the shader, such as
  raymarching with `@frapx/glsl-raymarch`, is fine).
- **Your own thin WebGL layer** — if you want small wrappers over programs and
  buffers and will write the render loop yourself, [OGL](https://github.com/oframe/ogl)
  and [twgl.js](https://twgljs.org/) are about the same size
  ([measurements](https://github.com/kramhash/frapx-bench)). frapx is for when you want the loop,
  sizing, pausing, reduced motion and context restore handled for you, and the
  packages above when you need them.

## Architecture

`@frapx/fx-canvas` is the lightweight flagship effect runtime. Optional capabilities such as SDF helpers, noise utilities, and presets live in separate packages (see the naming scheme above and `AGENTS.md`) so `@frapx/fx-canvas` stays small and focused.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Releasing

Release policy and manual publish steps are documented in
[`RELEASING.md`](./RELEASING.md).

## Examples

```sh
pnpm dev
```

Run a specific example with a workspace filter:

```sh
pnpm --filter @frapx/example-vite-basic dev
pnpm --filter @frapx/example-vite-feedback dev
pnpm --filter @frapx/example-vite-flowmap dev
pnpm --filter @frapx/example-vite-capture dev
pnpm --filter @frapx/example-vite-sdf dev
pnpm --filter @frapx/example-vite-raymarch dev
pnpm --filter @frapx/example-vite-passes dev
pnpm --filter @frapx/example-vite-poolrooms dev
pnpm --filter @frapx/example-vite-liminal-vein dev
pnpm --filter @frapx/example-vite-timeline dev
pnpm --filter @frapx/example-vite-hot-reload dev
pnpm --filter @frapx/example-vite-particles dev
pnpm --filter @frapx/example-vite-react dev
pnpm --filter @frapx/example-vite-react-particles dev
```

## Documentation Site

```sh
pnpm dev:docs
```

The docs site ([`apps/docs`](./apps/docs), Astro + Starlight) requires
`pnpm build` to have run first, since its Live Demo page imports the real
built `@frapx/fx-canvas` package rather than an aliased source path.

## Contributing

Bug reports, ideas and pull requests are welcome, in English or Japanese.
See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).

`@frapx/glsl-noise`, `@frapx/glsl-sdf` and `@frapx/glsl-raymarch` include third-party code under the
MIT License; its notices ship in each package's `LICENSES/` directory.

The frapx name and the logos in [`assets/brand`](./assets/brand) are not
covered by the MIT License. Use them only to refer to frapx itself.
