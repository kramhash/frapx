# Baked SDF skull

A showcase for [`@frapx/glsl-sdf-volume`](../../packages/glsl-sdf-volume). A skull baked into a 3D signed distance texture is raymarched as one more distance function. In a 12-second loop:

- 0–4 s: spheres orbit the skull and `frapx_opSmoothUnion` fuses them with it whenever they swing close.
- 4–8 s: the spheres are swallowed, the skull rounds into a ball (`mix` of the baked and an analytic distance), and spines grow out of it until it is a sea urchin.
- 8–12 s: the spines pull back, the skull returns, and the spheres come back out of it. The last frame equals the first.

Live: <https://kramhash.github.io/frapx/demos/sdf-skull/>

```sh
pnpm --filter @frapx/example-vite-sdf-skull dev
```

- The pointer nudges the camera. Time alone decides the shape, so `?still=<seconds>` draws one frame (`?still=7.5` is the urchin).
- With the OS "reduce motion" setting on, fx-canvas holds a still frame.
- WebGL2 is required (the volume is a `sampler3D`).

## The volume

`public/sdf/Skull.r16f-zstd.sdf.ktx2` (84 × 100 × 128 voxels, 1.6 MB) was baked from Khronos' [ScatteringSkull](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ScatteringSkull) (Vladimir Petkovic, CC0-1.0) by the 3dsdf-texture Blender extension:

```sh
blender -b --python <3dsdf-texture>/scripts/bake_cli.py -- \
  --input ScatteringSkull.glb --out out/ \
  --format r16f --zstd --resolution 128 --targets ktx2
```

It is `r16f` rather than `r8`: an `r8` volume stores distances only within a band of 8 voxels around the surface, and a wide smooth union reads past that band and turns boxy. The mesh is not centred in its own space, so the shader moves the middle of the volume's box to the origin.

## Export

The page registers itself with `registerRenderTarget()` (30 fps, 12 s, 1280 × 720):

```sh
pnpm --filter @frapx/example-vite-sdf-skull build
node packages/tool-render/dist/cli.js examples/vite-sdf-skull/dist --out renders/sdf-skull --encode h264
```
