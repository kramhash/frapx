# Changelog

## Unreleased

### Added

- `status` follows the instance live through fx-canvas's `onStatusChange`, so `"running"`, `"paused"` (offscreen, hidden, reduced motion) and `"context-lost"` reach React. An `onStatusChange` option or prop is chained.
- `setTimeSource(source | null)` and `setFragment(fragment)` on `ShaderBackgroundHandle`, no-op / `null` before mount.

### Changed

- Options that need a new instance are compared by value, in the hook as well as the component: plain objects and arrays by contents, functions and elements by reference. An inline `feedback={{ … }}` or `canvasStyle={{ … }}` no longer recreates the instance on every render, and changing them through `useShaderBackground` now recreates it without listing them in `recreateDeps`. An inline `dpr={() => 1}` still recreates every render. `recreateDeps` (hook) and `recreateKey` (component) remain for forcing a new instance.

### Fixed

- `onShaderReady` / `onShaderError` call the latest prop instead of the one from when the instance was created, like the render callbacks, so a re-rendered handler is not ignored on a later compile error or context loss.

## 0.8.0 - 2026-10-23

### Added

- `timeSource` prop. It switches in place like `clock`, and the instance calls the latest function through a stable wrapper, so an inline arrow function neither recreates the instance nor restarts `u_delta`.

## 0.7.0 - 2026-10-16

### Added

- `uniformSources` prop / hook option: `UniformSource`s such as `keyframes()` bound with `bindUniforms()` in array order. Sources are compared by identity; a changed list rebinds on the existing instance and a recreated instance is bound again.
- `bindUniforms` on the imperative handle.

## 0.6.0 - 2026-10-15

### Changed

- A new `fragment` swaps the shader in place with `setFragment()` instead of recreating the instance, so time, uniforms and feedback survive edits and React Fast Refresh. A compile error goes to `error` / `onShaderError` while the previous shader keeps drawing. An instance whose first shader failed is recreated instead.

## 0.5.0 - 2026-10-10

### Added

- `clock` and `resolution` props / hook options. Changing either switches the existing instance in place (`setClock` / `setResolution`) instead of recreating it; `resolution` is compared by value.
- `setTime`, `setClock` and `setResolution` on the `ShaderBackground` imperative handle.
- `captureFrame` and `resetFeedback` on the imperative handle. `captureFrame` rejects while no instance is mounted.
- Added the MIT `LICENSE` file to the published package.

## 0.4.0 - 2026-07-12

### Changed

- **Breaking: package renamed from `@frapx/shader-react` to `@frapx/react-canvas`**, following the `@frapx/shader` → `@frapx/fx-canvas` rename. No API changes. `@frapx/shader-react` is deprecated on npm and will not receive further updates.

### Added

- _Correction (noted after release):_ this version also shipped the `onResize` prop / hook option, forwarded without recreating the instance, which the entry above omitted.

## 0.3.0 - 2026-06-22

### Fixed

- Pinned the `@frapx/fx-canvas` dependency to `^0.6.1`. The previously published `0.2.0` shipped with an unresolved `workspace:*` range, which broke `npm install` for consumers; this release corrects it.
- `ShaderBackground` component now correctly forwards `respectReducedMotion`,
  `pauseWhenHidden`, and `canvas` props to the core instance. Previously these
  options leaked into DOM attributes and were silently ignored by the runtime.

### Added

- `ShaderBackgroundHandle` now exposes `setTextures()` and `setUniforms()` to
  match the full core `ShaderBackgroundInstance` API.

### Internal

- Option keys in `ShaderBackground` are now managed via a single `OPTION_KEYS`
  array with compile-time completeness guards, preventing future option-forwarding
  regressions when core adds new options.

## 0.2.0 - 2026-06-20

### Added

- Added `feedback` prop passthrough for the core `@frapx/fx-canvas` previous-frame feedback option.

## 0.1.0 - 2026-06-15

### Added

- Added the initial `@frapx/react-canvas` package.
- Added the `ShaderBackground` component.
- Added the `useShaderBackground()` hook.
- Added imperative control through `ShaderBackgroundHandle`.
- Added runtime `uniforms` and `textures` updates through the core shader
  instance.
