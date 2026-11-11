# Baked SDF skull

A showcase for [`@frapx/glsl-sdf-volume`](../../packages/glsl-sdf-volume). A skull baked into a 3D signed distance texture is raymarched as one more distance function. The loop is 8 bars at 128 BPM (15 s), and the skull turns once in it:

- Bars 1–4: spheres orbit the skull and swing in to touch it in turn on the beat, fused with it by `frapx_opSmoothUnion`. In bar 4 the skull swallows them.
- Bar 5, beat 1 (the drop): with the face toward the camera, spines grow straight out of the skull, fastest on the beat and at full length a bar later. From then on, every two beats each spine moves to a new length, half of them on even beats and half on odd.
- Bars 5–6: under the spines, the skull rounds into a ball (`mix` of the baked and an analytic distance) until it is a sea urchin, which holds through bar 7.
- Bar 8: the body turns back into the skull, the spines pull back into it, and the spheres come back out. The last frame equals the first.

The shader keeps time in beats, so `BPM` at the top of `src/main.ts` sets the tempo of everything. At 60 fps the clip loops without a seam only when the 32-beat loop is a whole number of frames, that is when 115200 / `BPM` is whole: 120, 128 and 144 work, 140 does not.

Live: <https://kramhash.github.io/frapx/demos/sdf-skull/>

```sh
pnpm --filter @frapx/example-vite-sdf-skull dev
```

- The pointer nudges the camera. Time alone decides the shape, so `?still=<seconds>` draws one frame (`?still=8` is the skull as the spines grow out of it, `?still=12` the urchin).
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

The page registers itself with `registerRenderTarget()` (30 fps, 15 s, 1280 × 720):

```sh
pnpm --filter @frapx/example-vite-sdf-skull build
node packages/tool-render/dist/cli.js examples/vite-sdf-skull/dist --out renders/sdf-skull --encode h264
```
