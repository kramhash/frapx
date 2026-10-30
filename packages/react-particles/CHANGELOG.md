# Changelog

## Unreleased

### Added

- Passes `sdf` through. Its placement and strengths change in place; another `volume` (by identity), adding or removing `attract` / `collide`, or a new `emit` recreates the instance.

## 0.5.0 - 2026-10-30

### Added

- `onStatusChange` option (prop and hook), as in `@frapx/react-canvas` 1.0. Changing it never recreates the instance; the latest callback is called.

### Changed

- **Breaking:** depends on `@frapx/fx-particles` ^0.5.0, so `respectReducedMotion` now defaults to `true`, matching `@frapx/react-canvas` 1.0: a reduced-motion user sees a still frame. Pass `respectReducedMotion={false}` to keep animating.
- `status` now follows the runtime live through `onStatusChange`: `"paused"` while offscreen, hidden or under reduced motion, and `"context-lost"`. Before, it changed only at ready, error and teardown.

## 0.4.0 - 2026-10-30

### Changed

- **Breaking:** depends on `@frapx/fx-particles` ^0.4.0, which follows `@frapx/core` 0.8.0: a number or function `dpr` is used as given and capped only when `maxDpr` is set, values below 1 are allowed, and `dpr` or `maxDpr` `<= 0` or non-finite throws `RangeError`. Pass `maxDpr` to keep the old cap. An app using it with `@frapx/fx-canvas` 1.0 installs one core.

## 0.3.0 - 2026-10-30

### Changed

- Depends on `@frapx/fx-particles` ^0.3.0, which follows `@frapx/core` 0.7.0, so an app using it with `@frapx/fx-canvas` 0.12 installs one core.

## 0.2.0 - 2026-10-23

### Added

- `timeSource` prop. It switches in place like `clock`, and the instance calls the latest function through a stable wrapper, so an inline arrow function neither recreates the instance nor restarts `u_delta`.

## 0.1.0 - 2026-10-16

### Added

- Initial release: `<Particles />` and `useParticles()` React bindings for `@frapx/fx-particles`.
- Options are compared by value. Uniform-backed values, `color`, `palette`, `blend`, `clock` and `resolution` change in place; other changes, removing an in-place value, and a `rate` that outgrows the automatic pool recreate the instance.
- `uniformSources` prop / hook option: `UniformSource`s such as `keyframes()` bound in array order and rebound on a recreated instance.
- An imperative handle forwarding the instance's methods, including `captureFrame`, `reset` and `bindUniforms`.
