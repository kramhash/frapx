# Changelog

## 0.1.0 - 2026-10-31

### Added

- First release: sample baked 3D signed distance fields from the Blender extension 3dsdf-texture.
- `loadSdfVolume(url | ArrayBuffer, { signal?, zstd? })` reads `.sdf.ktx2` (format version 1: `r8` / `r16f` / `r32f`, uncompressed or Zstandard through a caller-supplied decoder) into a 3D data texture input, its uniforms and its metadata. No dependencies.
- GLSL `sdfVolume`: `frapx_sdVolume` (a lower bound of the distance outside the box, `max(b, e - b)`, so sphere tracing is safe from anywhere), `frapx_sdVolumeGrad` (outside the box, the unit vector pointing away from the surface point nearest the box point) and `frapx_sdVolumeSample` (the clamped sample). WebGL2 (`#version 300 es`) only.
