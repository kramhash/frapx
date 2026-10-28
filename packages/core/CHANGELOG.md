# Changelog

## Unreleased

### Added

- `time` on the instance: the time of the last frame drawn — the value `setTime()` would need to reproduce that frame. While gated it is the time the loop stopped at, and with a `timeSource` it is the last value read from the source. Lets a page read back where the picture is, for example to start audio at the same position or to render a frame counter.

## 0.6.0 - 2026-10-23

### Added

- `timeSource` host option and `setTimeSource(source | null)`: the realtime loop takes each frame's time from an external transport (`() => seconds`), such as an audio player, while the offscreen, hidden and reduced-motion gates and the pointer keep working. `time` is the source's value, never clamped; `delta` is the step from the previous frame, clamped to `[0, 0.1]`, and 0 when the source goes back or on the first frame after a pause. The reduced-motion still frame reads the source; `render()` and `captureFrame()` redraw at the last frame's time. A manual clock ignores the source but keeps it, and `renderMode: "demand"` (no frame loop) never reads it, with a `debug` warning. New `TimeSource` type.

### Fixed

- An unawaited `ready` no longer produces an unhandled rejection when `destroy()` rejects it with `DestroyedError` (for example a React StrictMode effect cleanup) or when the environment is unsupported (`UnsupportedError`, including the no-op instance created without a browser). Awaiting `ready` or `.then(…, onError)` still observes the rejection. Setup failures and `TargetNotFoundError` still surface.

## 0.5.1 - 2026-10-20

### Fixed

- The host's `onResize` now also fires when a frame is the first to see a new size. Browsers run animation frames before resize observations, so in a running realtime loop the frame took the new size and the resize observer then found nothing changed: `onResize` almost never fired while playing. It runs before that frame's draw.

## 0.5.0 - 2026-10-15

### Added

- `ShaderCompileError` carries `stage` (`"vertex"`, `"fragment"`, `"link"` or `null`) and `lines`: each error the driver's info log locates, with its line number, message, that source line and two lines of context either side (`ShaderErrorLine`). The message is still the raw log.
- `parseShaderLog(log, source)` for runtimes that compile their own shaders.
- `keyframes(tracks, { ease })`: a dependency-free `UniformSource` that interpolates float and vec2–vec4 keyframes per component, with `"linear"`, `"smooth"`, `"step"` or custom eases.
- `createUniformBindings()`: ordered `UniformSource`s merged into normalized uniforms for a time, for runtimes that implement `bindUniforms()`.

### Fixed

- `createProgram()` no longer leaks the compiled vertex shader when the fragment shader fails to compile.
- After a WebGL context is restored, an instance that was not running (stopped, or on a manual clock) returns to its previous status instead of staying `"context-lost"`, and a stopped realtime instance redraws.

## 0.4.0 - 2026-10-13

### Added

- Shared program state for runtimes built on the host, moved here from `@frapx/fx-canvas` so `@frapx/fx-passes` can reuse it:
  - Uniform helpers `normalizeUniform`, `applyUniform`, `applyProgramUniform`, `applyUniforms`, `collectUniformLocations` and `createUniformCache`, with the `NormalizedUniform` type and the uniform input types (`UniformInput`, `UniformInputMap`, `UniformRuntimeValue`, `ExplicitUniformInput`, `UniformType`, `UniformScalar`, `UniformVec2`–`UniformVec4`).
  - `createTextureSet(inputs)`: named image textures with texture-unit allocation (`reserveUnit` also covers runtime-owned samplers), superseded-load handling, binding and disposal.
  - `createFullscreenProgram(gl, fragment, vertex?)`: compiles a fragment shader with the matching fullscreen-quad vertex shader and exposes its uniform locations, `use()`, `draw()` and `dispose()`.
- `rgba32f` render targets (`createRenderTarget` / `createPingPong`), with the same WebGL2 + `EXT_color_buffer_float` requirement as `rgba16f`. They sample with nearest filtering unless `OES_texture_float_linear` is available. `captureFrame({ format: "rgba16f" })` also reads an `rgba32f` capture source.
- `onCaptureDraw(state, signal)` host option: draws the frame `captureFrame()` reads over several tasks (for example sample accumulation that waits for the GPU between draws). The host holds its render lock until it settles, so other frames do not interleave, and reads the result in the settling task. Resizes requested meanwhile apply after the frame is read, and a context lost (even if restored) meanwhile rejects the capture.
- `signal` capture option: an aborted signal rejects `captureFrame()` before drawing and is passed to `onCaptureDraw`.
- `waitForGpu(gl)`: resolves once the GPU has finished the submitted work by polling a fence between tasks, so long renders can yield and avoid the GPU watchdog. Resolves immediately on WebGL1.

## 0.3.0 - 2026-10-10

### Added

- `clock: "manual"` option on `createRuntimeHost` and `setClock()` / `setTime()` on the instance. A manual clock never schedules frames: time changes only through `setTime()` (with `delta` the difference from the previous call) and frames are drawn only by `render()`, which ignores offscreen/hidden gating. The frame state reports a neutral pointer and `reducedMotion: false`, so identical time and uniforms produce identical pixels.
- `resolution` option and `setResolution([w, h] | null)` to fix the internal render size independently of the target. The canvas is letterboxed with `object-fit: contain`, the viewport size still tracks the target, and `pixelRatio` is derived from the fit (`dpr` / `maxDpr` are ignored). Sizes beyond the GPU's viewport/renderbuffer limits fail with `UnsupportedError`.
- Creating a host with neither `target` nor `canvas` now works when `resolution` is given: a detached canvas is created and no layout observers are attached.
- `ClockMode` and `Resolution` types, and `SetupCanvasOptions.detached` / `DomSetup.detached`.
- `createRenderTarget(gl, width, height, options)` and `createPingPong(...)`: texture-backed framebuffers with an explicit `format` (`"rgba8"` or `"rgba16f"`). `rgba16f` needs WebGL2 with `EXT_color_buffer_float`; otherwise it warns and allocates `rgba8`, or throws `UnsupportedError` with `formatFallback: false`. `supportsRenderTargetFormat` / `resolveRenderTargetFormat` expose the detection, and `isWebGL2Context` is now exported.
- `captureFrame({ format })` on the host: draws a frame (bypassing pause gates) and reads it back in the same task as a PNG `Blob`, `Uint8Array` (`rgba8`) or `Float32Array` (`rgba16f`, from the new `captureSource` option), with rows top first.
- Added the MIT `LICENSE` file to the published package.

### Changed

- An `UnsupportedError` thrown from `onInit` now sets status `"unsupported"` instead of `"error"`.
- A throwing `onDraw` no longer leaves the host stuck in its in-render state.

## 0.2.0 - 2026-07-12

### Changed

- **Breaking: package renamed from `@frapx/runtime` to `@frapx/core`.** No API changes — only the npm package name and import path change. `@frapx/runtime` is deprecated on npm and will not receive further updates.

### Added

- _Correction (noted after release):_ this version also shipped the `onResize` host option (called only when the measured size actually changes) and the `createBlitter(gl)` fullscreen-quad blit utility, which the entry above omitted.

## 0.1.0 - 2026-06-27

Initial release. Shared WebGL runtime extracted from `@frapx/fx-canvas`.

### Added

- `createRuntimeHost` — WebGL lifecycle host with canvas setup, animation loop, visibility gating, reduced-motion support, and context-loss recovery.
- Shared error hierarchy: `ShaderError`, `UnsupportedError`, `TargetNotFoundError`, `ShaderCompileError`, `TextureLoadError`, `DestroyedError`.
- Texture loading utilities with CORS support and dual uniform naming.
- WebGL shader compilation with GLSL ES 1.00 and 3.00 support, fullscreen quad geometry.
- Uniform naming convention utilities (`toUniformName`, `fromUniformName`).
- DOM canvas setup helpers for HiDPI rendering.
- `hexToRgb` / `hexToRgba` color utilities.
- `glsl` template tag and `glslUtils` GLSL snippet helpers.
