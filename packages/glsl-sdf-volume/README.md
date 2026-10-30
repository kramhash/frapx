# @frapx/glsl-sdf-volume

Baked 3D signed distance fields for frapx shaders (`@frapx/fx-canvas`, `@frapx/fx-passes`). Load a mesh's SDF baked in Blender and use it like any other distance function: raymarch it with [`@frapx/glsl-raymarch`](../glsl-raymarch), blend it with primitives from [`@frapx/glsl-sdf`](../glsl-sdf).

**Requires WebGL2** (`#version 300 es`): the volume is a `sampler3D`.

Make the volumes with the Blender extension [3dsdf-texture](https://github.com/kramhash/3dsdf-texture): select a mesh, bake, and export the `ktx2` target to get a `<name>.sdf.ktx2` file.

## Install

```sh
pnpm add @frapx/fx-canvas @frapx/glsl-sdf-volume
```

The package has no dependencies.

## Usage

```ts
import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import { raymarch, raymarchCamera, raymarchCameraUniforms } from "@frapx/glsl-raymarch";
import { loadSdfVolume, sdfVolume } from "@frapx/glsl-sdf-volume";

const volume = await loadSdfVolume("/sdf/Suzanne.r16f.sdf.ktx2");

createShaderBackground({
  target: ".hero",
  textures: { sdf: volume.texture },
  uniforms: {
    ...volume.uniforms("sdf"), // sdfMin, sdfMax, sdfScale, sdfOffset
    camPos: [1.3, 0.6, 3.6],
    camTarget: [0, 0, 0],
    fov: Math.PI / 4
  },
  fragment: glsl`#version 300 es
    precision highp float;
    uniform vec2 u_resolution;
    uniform highp sampler3D u_sdf;
    uniform vec3 u_sdfMin;
    uniform vec3 u_sdfMax;
    uniform float u_sdfScale;
    uniform float u_sdfOffset;
    out vec4 fragColor;

    ${sdfVolume}
    ${raymarchCamera}
    ${raymarchCameraUniforms}
    ${raymarch}

    float frapx_map(vec3 p) {
      return frapx_sdVolume(u_sdf, p, u_sdfMin, u_sdfMax, u_sdfScale, u_sdfOffset);
    }

    void main() {
      vec3 rd = frapx_cameraRay(gl_FragCoord.xy, u_resolution);
      float t = frapx_raymarch(u_camPos, rd, 0.0, 20.0);
      vec3 color = vec3(0.0);
      if (t > 0.0) {
        vec3 n = frapx_normal(u_camPos + rd * t, 0.01);
        color = vec3(0.5 + 0.5 * n);
      }
      fragColor = vec4(color, 1.0);
    }
  `
});
```

## API

### `loadSdfVolume(source, options?)`

`source` is a URL (fetched) or the file's `ArrayBuffer`. Resolves to:

| Field | |
| --- | --- |
| `texture` | A 3D data texture input — `{ data, size: [nx, ny, nz], format, filter: "linear", wrap: "clamp" }` — for `textures`. Its `u_<name>Size` is a vec3. |
| `uniforms(name = "sdf")` | `{ [name]Min, [name]Max, [name]Scale, [name]Offset }`: the box and the decode values the GLSL functions take after the texture. |
| `meta` | The file's `3dsdf.meta`: `bboxMin`, `bboxMax`, `voxelSize`, `decode`, plus the fields frapx does not read (`units`, `axis`, `sign`, `source`). |

Options:

- `signal` — aborts the fetch.
- `zstd` — a decoder for files exported with *Zstd Compression* (`(bytes, size) => Uint8Array`, see below).

A file this version does not read fails with an error naming the field: the KTX2 identifier, `vkFormat` (9 `R8_UNORM`, 76 `R16_SFLOAT` and 100 `R32_SFLOAT` are read), `pixelDepth` 0, `supercompressionScheme` (0 or 2), a missing `3dsdf.meta`, its `version` (1), `bboxMin` / `bboxMax` / `voxelSize` / `decode`, or a level 0 of the wrong length.

### GLSL: `sdfVolume`

```glsl
float frapx_sdVolume(highp sampler3D tex, vec3 p, vec3 bmin, vec3 bmax, float scale, float offset);
vec3 frapx_sdVolumeGrad(highp sampler3D tex, vec3 p, vec3 bmin, vec3 bmax, float scale, float offset);
float frapx_sdVolumeSample(highp sampler3D tex, vec3 p, vec3 bmin, vec3 bmax, float scale, float offset);
```

- `frapx_sdVolume` is the signed distance at `p` (negative inside), in the units of the source object. Inside the box it is the sampled value `v * scale + offset`. Outside, with `b` the distance to the box and `e` the value at the nearest point on it, it is `max(b, e - b)`: both are lower bounds of the true distance, so sphere tracing from outside never steps through the surface.
- `frapx_sdVolumeGrad` points away from the surface. Inside the box it is the gradient from central differences one voxel apart; normalize it for a surface normal. Outside it is the unit vector from the surface point nearest the box point to `p`. That is not the gradient of `frapx_sdVolume` there: `e - b` shrinks as `p` moves away from the box, so that gradient would point inward near it.
- `frapx_sdVolumeSample` is the decoded value at `p` clamped into the box, with no distance added outside.
- Placement is yours: transform `p` into the volume's space before the call (`p = inverse(rotation) * (p - position) / scale`) and multiply the result by `scale`.

## Formats

| Format | Stored | Size (Suzanne, 128×96×84) | Notes |
| --- | --- | --- | --- |
| `r8` | distance within a band of 8 voxels, as 0–255 | 1.0 MB, 0.2 MB with zstd | Distances saturate beyond the band. Smooth blends (`frapx_opSmoothUnion` with `k`) wider than the band turn boxy, and marching far inside the box takes short steps. |
| `r16f` | distance as half float | 2.1 MB | Accurate everywhere in the box. |
| `r32f` | distance as float | 4.1 MB | Sampled with nearest filtering unless the GPU has `OES_texture_float_linear`. |

All three decode with the same `v * scale + offset`, so the shader does not change with the format.

## Zstandard-compressed files

Files exported with *Zstd Compression* (`--zstd`) need a decoder: browsers' `DecompressionStream` cannot read zstd, and this package bundles none. [fzstd](https://github.com/101arrowz/fzstd) (pure JS, about 7 KB gzipped) works:

```ts
import { decompress } from "fzstd";

const volume = await loadSdfVolume("/sdf/Suzanne.r8-zstd.sdf.ktx2", {
  zstd: (bytes, size) => decompress(bytes, new Uint8Array(size))
});
```

Compression pays off mainly for `r8` (about 20–30% of the file).

## Example

[`examples/vite-sdf-volume`](../../examples/vite-sdf-volume) raymarches Suzanne from a zstd `r8` file and smooth-unions it with an orbiting sphere. `?still` shows it from the camera of 3dsdf-texture's three.js viewer. `?view=particles` and `?view=surface` drive [`@frapx/fx-particles`](../fx-particles#following-a-baked-sdf) with the same volume.

## License

MIT
