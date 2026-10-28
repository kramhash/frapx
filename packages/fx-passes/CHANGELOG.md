# Changelog

## Unreleased

### Added

- `time` on the instance: the time of the last frame drawn, before any `accumulation.loop` wrapping — the value `setTime()` would need to reproduce that frame. While gated it is the time the loop stopped at, and with a `timeSource` it is the last value read from the source. Lets a page read back where the picture is, for example to start audio at the same position or to render a frame counter.

## 0.4.0 - 2026-10-23

### Added

- `timeSource` option and `setTimeSource(source | null)`, as in `@frapx/fx-canvas`: the realtime loop follows an external transport and keeps the lifecycle gates. Re-exports the `TimeSource` type.

### Fixed

- Leaving `ready` unawaited no longer logs an unhandled rejection after `destroy()` or in an unsupported environment, via `@frapx/core`; awaiting it still rejects. fx-passes has no React binding, so this removes the `Uncaught (in promise) DestroyedError` that every StrictMode user saw.

## 0.3.0 - 2026-10-20

### Added

- `onResize(state)`, as in `@frapx/fx-canvas`: called whenever the render size actually changes (not on setup, but also after `setResolution()`; a resize requested during `captureFrame()` waits for the capture). `state` is the new exported `PassesRenderState` type, with the same fields as fx-canvas' `RenderState`. The pass buffers take the new size on the next draw.
- `accumulation.loop` (seconds) for seamless loops: every pass sees the time wrapped into `[0, loop)` (`u_frameTime`, `u_time`, and the time bound uniforms are evaluated at), with each sample's shutter offset added in double precision, so a frame one loop later is byte-identical at any sample count. Before, `u_time` rounded to float32 made frame 960 of a 16 s loop differ from frame 0 by a few levels once `samples > 1`. `ResolvedAccumulation` gains `loop`.

## 0.2.0 - 2026-10-15

### Added

- `setFragment(name, fragment)` swaps one pass' fragment shader in place, keeping its buffers, the time, uniforms and textures, and restarting the frame's samples. A compile error is returned (and passed to `onError`) and the previous shader keeps drawing. A swap during `captureFrame()` applies from the next frame.
- `bindUniforms(source)`: accumulating passes evaluate the source at every sample's time within the shutter, so keyframed motion gets motion blur; later passes use the frame's time. A source whose values change for the same time restarts the frame's samples. `keyframes()` is re-exported.
- `examples/vite-timeline`: a camera flying along keyframes, motion blurred, renderable with `frapx-render`.
- Re-exports the `ShaderErrorLine` and `ShaderStage` types; `ShaderCompileError` has `stage` and `lines`.

## 0.1.0 - 2026-10-13

### Added

- Added the initial `@frapx/fx-passes` package: a WebGL2 multipass runtime for video work on the `@frapx/core` host shared with `@frapx/fx-canvas`.
- `createPasses({ passes })`: passes drawn in order, the last one shown and captured. `inputs` sample other passes as `u_<name>` / `u_<name>Size`. An earlier pass gives this frame's output, and the pass itself or a later one gives the previous frame's (Shadertoy-style, with automatic double buffering and `resetFeedback()`). Each pass has its own `format` (`rgba8`, `rgba16f` by default, `rgba32f`), `scale`, `filter` and `wrap`.
- Sample accumulation: `accumulate: true` passes draw `accumulation.samples` samples per frame. The runtime sums them in 32-bit float and passes the mean on. `u_time` spreads over the open shutter (`shutter` as a fraction of `1 / fps`), with `u_frameTime`, `u_jitter` (R3 sequence, none on sample 0), `u_sampleIndex` and `u_sampleCount`. `setAccumulation()`, `samplesDrawn` and `onSample` cover changes and progress.
- Progressive refinement: an unchanged frame gains one sample per draw, and a stopped or manual-clock instance refines it on animation frames.
- `captureFrame()` draws every sample of the frame from scratch, waits for the GPU between adaptive batches, honors `signal` between samples, and reads the last pass (`rgba16f` reads its float output).
- Re-exports the `glsl` template tag from `@frapx/core`.
- `examples/vite-passes`: an accumulated, motion-blurred fan with a quarter-resolution glow pass, also used by the E2E tests.
