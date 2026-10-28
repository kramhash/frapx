# Changelog

## Unreleased

### Added

- `time` on the instance: the time of the last frame drawn — the value `setTime()` would need to reproduce that frame. While gated it is the time the loop stopped at, and with a `timeSource` it is the last value read from the source. Lets a page read back where the picture is, for example to start audio at the same position or to render a frame counter.

## 0.2.0 - 2026-10-23

### Added

- `timeSource` option and `setTimeSource(source | null)`, as in `@frapx/fx-canvas`: the realtime loop follows an external transport and keeps the lifecycle gates. A jump in the source is handled like a slow frame, not a seek: forward runs up to 4 steps and drops the rest, back restarts from the prewarmed start, so no frame costs more than the prewarm plus 4 steps. Re-exports the `TimeSource` type.

### Fixed

- Leaving `ready` unawaited no longer logs an unhandled rejection after `destroy()` or in an unsupported environment, via `@frapx/core`; awaiting it still rejects.

## 0.1.1 - 2026-10-16

### Fixed

- The `debug` warning about the pool now fires when `rate` times the longest lifetime exceeds `maxParticles`, the point where particles are recycled before their lifetime ends. It used to fire only when one step spawned more than the whole pool.
- README: separates the simulation uniforms from the drawing-only `opacity` and `twinkle` (only the former replay under a manual clock), notes that force uniforms need their force, and documents how the pool is sized.

## 0.1.0 - 2026-10-16

### Added

- Added the initial `@frapx/fx-particles` package: WebGL2 GPU particles for website backgrounds on the `@frapx/core` host shared with `@frapx/fx-canvas`.
- `createParticles(options)`: a transform-feedback simulation in a fixed-size ring pool, drawn as instanced quads into a transparent canvas. Six presets (`dust`, `snow`, `sparkles`, `bubbles`, `fireflies`, `confetti`), merged under the other options.
- Forces compiled from config: `gravity`, `drag`, `curl` (divergence-free curl noise from `@frapx/glsl-noise`) and `pointer`. Over-life color and alpha through a lookup texture, a per-particle `palette`, `sizeOverLife` curves, `spin`, `tumble`, `twinkle`, five procedural sprites or an image, `additive` or `normal` blending, and 2.5D depth with `perspective`.
- Fixed-step time: the frame at `t` is the state after `floor(t * simulationRate)` steps from a `prewarm`ed start. A manual clock runs every step and replays from the start when going back, so frames are reproducible and split renders line up; a realtime frame that falls far behind drops time instead of stalling.
- `setUniform()` / `bindUniforms()` for `rate`, the force values (`gravity`, `drag`, `curlStrength` / `curlScale` / `curlSpeed`, `pointerStrength` / `pointerRadius`), `perspective`, and the drawing-only `opacity` and `twinkle`. Bound timelines evaluate simulation uniforms at every step's time; under a manual clock changing a simulation uniform, a binding or the canvas size replays from the start. `keyframes()` is re-exported.
- `captureFrame()` catches up in batches with GPU waits. `format: "rgba16f"` draws into a half-float buffer for 16-bit export, and `"png"` / `"rgba16f"` captures are straight alpha.
- `setColor()`, `setPalette()`, `setBlend()`, `reset()`, `maxParticles` and `simulationRate`.
- `examples/vite-particles`: every preset over an `fx-canvas` background, with a pointer push, renderable with `frapx-render` (`--set preset=<name>`).
