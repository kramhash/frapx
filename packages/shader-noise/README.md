# @frapx/shader-noise

[![npm version](https://img.shields.io/npm/v/@frapx/shader-noise.svg)](https://www.npmjs.com/package/@frapx/shader-noise)

Lightweight GLSL 3D noise helpers for `@frapx/shader`.

This package is intentionally separate from `@frapx/shader` so the core runtime stays small. It exports GLSL strings that can be embedded in fragment shaders.

## Install

```sh
pnpm add @frapx/shader @frapx/shader-noise
```

## Usage

```ts
import { createShaderBackground, glsl } from "@frapx/shader";
import { fbm3d } from "@frapx/shader-noise";

createShaderBackground({
  target: ".hero",
  fragment: glsl`
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;

    ${fbm3d}

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float n = frapx_fbm3d(vec3(uv * 4.0, u_time * 0.1));
      gl_FragColor = vec4(vec3(n * 0.5 + 0.5), 1.0);
    }
  `
});
```

## Exports

- `simplex3d` - self-contained `frapx_simplex3d(vec3)`
- `perlin3d` - self-contained `frapx_perlin3d(vec3)`
- `periodicPerlin3d` - self-contained `frapx_periodicPerlin3d(vec3, vec3)`
- `fbm3d` - self-contained `frapx_fbm3d(vec3)` using simplex noise
- `noise3d` - combined snippet with all 3D functions
- `noise3dCommon`, `simplex3dBody`, `perlin3dBody`, `periodicPerlin3dBody`, `fbm3dBody` - composable building blocks

Use `noise3d` when you need multiple functions in one shader to avoid duplicating shared helper functions.

## Notes

- Function names are prefixed with `frapx_` to reduce GLSL global name collisions.
- The snippets target WebGL1 / GLSL ES 1.00.
- Use `precision highp float;` in shaders that include these snippets.

## License

The 3D simplex and classic Perlin implementations are derived from `webgl-noise` by Ashima Arts and Stefan Gustavson, distributed under the MIT license. See [`LICENSES/webgl-noise-MIT.txt`](./LICENSES/webgl-noise-MIT.txt).
