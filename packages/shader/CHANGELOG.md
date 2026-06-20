# Changelog

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
