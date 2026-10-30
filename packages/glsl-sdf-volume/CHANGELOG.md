# Changelog

## Unreleased

### Added

- First release: sample baked 3D signed distance fields from the Blender extension 3dsdf-texture.
- `loadSdfVolume(url | ArrayBuffer, { signal?, zstd? })` reads `.sdf.ktx2` (format version 1: `r8` / `r16f` / `r32f`, uncompressed or Zstandard through a caller-supplied decoder) into a 3D data texture input, its uniforms and its metadata. No dependencies.
- GLSL `sdfVolume`: `frapx_sdVolume` (a lower bound of the distance outside the box, `max(b, e - b)`, so sphere tracing is safe from anywhere) and `frapx_sdVolumeGrad`. WebGL2 (`#version 300 es`) only.
