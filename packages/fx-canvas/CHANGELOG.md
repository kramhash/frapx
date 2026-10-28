# Changelog

## Unreleased

### Added

- `time` on the instance: the time of the last frame drawn — the value `setTime()` would need to reproduce that frame. While gated it is the time the loop stopped at, and with a `timeSource` it is the last value read from the source. Lets a page read back where the picture is, for example to start audio at the same position or to render a frame counter.

## 0.11.0 - 2026-10-23

### Added

- `timeSource` option and `setTimeSource(source | null)` make the realtime loop follow an external transport such as an audio player: `u_time` is the source's value on every frame, and offscreen, hidden and reduced-motion pausing and the pointer uniforms keep working, which `clock: "manual"` bypasses. `u_delta` is clamped to 0.1 s and is 0 when the source goes back. A manual clock ignores the source but keeps it; `renderMode: "demand"` does not read it (`debug` warns). Re-exports the `TimeSource` type.

### Fixed

- Leaving `ready` unawaited no longer logs an unhandled rejection after `destroy()` or in an unsupported environment, via `@frapx/core`; awaiting it still rejects.

### Documentation

- "Following an audio transport" in the README and on the docs site, with why aligning a realtime clock once at play drifts.
- When `ready` rejects and when it surfaces as unhandled, in the README and on the docs site.

## 0.10.1 - 2026-10-20

### Fixed

- `onResize` fires when the canvas size changes while the realtime loop is running. It used to fire almost only when the loop was stopped, since a frame picked up the new size before the resize observer did (fixed in `@frapx/core`).

### Documentation

- Documented `onResize(state)` in the README and on the docs site.

## 0.10.0 - 2026-10-15

### Added

- `setFragment(fragment)` swaps the fragment shader in place for hot reloading. The time, uniforms, textures and feedback history carry over. A compile error is returned (and passed to `onError`) instead of thrown, and the previous shader keeps drawing.
- `bindUniforms(source)` drives uniforms from a `{ get(time) }` source evaluated at the frame's time before every draw, overriding `setUniform()` values; `keyframes()` (re-exported from `@frapx/core`) is a dependency-free source.
- `ShaderCompileError` now has `stage` and `lines` (the located errors with their source lines); re-exports the `ShaderErrorLine` and `ShaderStage` types.

## 0.9.0 - 2026-10-13

### Added

- `captureFrame({ signal })`: an already-aborted signal rejects the capture without drawing.

### Changed

- Uniform, texture and program management now come from `@frapx/core`, which `@frapx/fx-passes` shares. Behavior is unchanged. The uniform input types are re-exported from `@frapx/core`; they keep the same names and shapes.

## 0.8.0 - 2026-10-10

### Added

- `clock: "manual"` option, `setClock()` and `setTime()` for deterministic rendering: no animation loop runs, `render()` draws even while offscreen or hidden, and `u_pointer*` / `u_reducedMotion` stay at 0. In demand mode, uniform and texture changes do not trigger a redraw under a manual clock.
- `resolution` option and `setResolution([w, h] | null)` to render at a fixed internal size (`u_resolution`) while `u_viewportSize` keeps the displayed size and `u_pixelRatio` is derived from both. Without `target` or `canvas`, a detached canvas is created.
- `clock` getter on the instance, and exported `ClockMode` / `Resolution` types.
- `captureFrame({ format: "png" | "rgba8" | "rgba16f" })`: draws a frame and reads it back in the same task, independent of `preserveDrawingBuffer`, with rows top first. Draws even while paused, offscreen or hidden.
- `feedback: { format: "rgba16f" }` for half-float feedback buffers on WebGL2 with `EXT_color_buffer_float`. Requesting it tries a WebGL2 context even for GLSL ES 1.00 shaders. Unsupported environments warn and use `rgba8`, or fail with `UnsupportedError` when `formatFallback: false`. `feedbackFormat` reports the allocated format.
- `resetFeedback()` clears the feedback history.
- Re-exported `createRenderTarget`, `createPingPong`, `supportsRenderTargetFormat` and their types from `@frapx/core`, next to `createBlitter`.
- `examples/vite-capture`: a raymarched scene exported as a 4K PNG sequence.
- Added the MIT `LICENSE` file to the published package.

### Changed

- Feedback buffers are now built on `@frapx/core`'s `createPingPong`, and the copy to the canvas uses `createBlitter` instead of a private copy shader. Output is unchanged.

## 0.7.0 - 2026-07-12

### Changed

- **Breaking: package renamed from `@frapx/shader` to `@frapx/fx-canvas`.** No API changes — `createShaderBackground` and all other exports are unchanged; only the npm package name and import path change. `@frapx/shader` is deprecated on npm and will not receive further updates.

### Added

- _Correction (noted after release):_ this version also shipped the `onResize` option (called with a `RenderState` whenever the size actually changes) and re-exported `createBlitter` / `Blitter` from `@frapx/core`, which the entry above omitted.

## 0.6.1 - 2026-06-27

### Changed

- Extracted shared WebGL utilities into `@frapx/core`. No public API or behavior changes. `@frapx/core` is added as a runtime dependency and will be installed automatically.
- Pinned the `@frapx/core` dependency to `^0.1.0` (was published as an unresolved `workspace:*` range).

## 0.6.0 - 2026-06-20

### Added

- Added `feedback: true | FeedbackOptions` to expose the previous rendered frame as a managed `u_previousFrame` texture backed by internal ping-pong framebuffers.
- Added `examples/vite-feedback` as an interactive feedback demo.

## 0.5.0 - 2026-06-20

### Added

- Added WebGL2 / GLSL ES 3.00 support: starting your fragment shader with `#version 300 es` automatically requests a `webgl2` context and selects a matching internal vertex shader (`in`/`out` syntax). No configuration needed. Shaders without this directive continue to use WebGL1 unchanged.
- Added `GLContext` exported type (`WebGLRenderingContext | WebGL2RenderingContext`). The `gl` getter and `RenderState.gl` now reflect the actual context type. This is a minor breaking change for callers typed as `WebGLRenderingContext`.
- When `#version 300 es` is detected but WebGL2 is unavailable, the instance transitions to `status: "unsupported"` and `onError` receives an `UnsupportedError` with a descriptive message. No downgrade to WebGL1 is attempted.

## 0.4.0 - 2026-06-20

### Added

- Added `pauseWhenHidden` (default `true`): pause the render loop while the document is hidden (e.g. a background tab) and resume when it is visible again.
- Added `respectReducedMotion` (default `false`): when enabled, hold a single static frame while the OS "prefers reduced motion" setting is on, with live updates when the user toggles it. The motion gate does not apply in `renderMode: "demand"`.
- Added the always-supplied `u_reducedMotion` built-in uniform (0/1) and `state.reducedMotion` on the render state.

### Changed

- **Behavior change:** `pauseWhenHidden` defaults to `true`, so the loop now pauses on hidden tabs by default. Pass `pauseWhenHidden: false` to keep the previous always-running behavior.
- Unified offscreen/hidden/reduced-motion pausing onto a single gate model so visibility and motion changes reconcile to a consistent state regardless of event order. No public API change.

## 0.3.0 - 2026-06-15

### Added

- Added `setTexture()` and `setTextures()` for runtime texture updates.

### Changed

- Preserved runtime texture updates across WebGL context restore.
- Rebound core draw state after render hooks to isolate user WebGL side effects.
