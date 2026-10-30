# @frapx/react-canvas

[![npm version](https://img.shields.io/npm/v/@frapx/react-canvas.svg)](https://www.npmjs.com/package/@frapx/react-canvas)

React bindings for `@frapx/fx-canvas`.

This package is a thin lifecycle adapter. It does not replace the core render
loop with React state, and it does not ship CSS.

## Install

```sh
pnpm add @frapx/fx-canvas @frapx/react-canvas react
```

## Component

```tsx
import { ShaderBackground } from "@frapx/react-canvas";
import { glsl } from "@frapx/fx-canvas";

const fragment = glsl`
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
}
`;

export function HeroBackground() {
  return <ShaderBackground fragment={fragment} className="hero-bg" />;
}
```

The component renders a wrapper `div` and mounts the shader canvas into it.
The wrapper defaults to `position: relative` and `overflow: hidden`; layout,
height, and visual styling are controlled by your app.

Core shader options pass through as props, including `feedback`:

```tsx
<ShaderBackground fragment={feedbackFragment} feedback />;
```

Initialization options such as `vertex`, `feedback`, `renderMode`, `dpr`, and
canvas settings recreate the underlying shader instance when they change. They
are compared by value: plain objects and arrays such as `feedback` and
`canvasStyle` by contents, so an inline literal with the same contents keeps
the instance, and functions (`dpr`) and elements (`canvas`) by reference, so an
inline `dpr={() => 1}` recreates on every render. Pass `recreateKey` to force a
new instance. Runtime `uniforms` and `textures` update the existing instance, and a new
`fragment` is swapped in place (`setFragment`), keeping the time, uniforms and
feedback across edits and Fast Refresh. A compile error goes to `error` /
`onShaderError` while the previous shader keeps drawing; an instance whose first
shader failed is recreated.

## Hook

```tsx
import { useMemo } from "react";
import { useShaderBackground } from "@frapx/react-canvas";

export function ShaderPanel({ intensity }: { intensity: number }) {
  const uniforms = useMemo(() => ({ intensity }), [intensity]);
  const { ref, instance, status, error } = useShaderBackground({
    fragment,
    uniforms,
    feedback: true
  });

  return <div ref={ref} />;
}
```

The hook recreates the instance on the same value comparison as the component,
so options such as `feedback` and `vertex` need no extra dependency. `uniforms`
and `textures` are updated on the existing instance with `setUniforms()` and
`setTextures()`, and a new `fragment` is swapped in with `setFragment()`. The
optional second argument lists extra values whose change recreates the instance.

`status` follows the instance live through `onStatusChange`, including
`"paused"` while offscreen or hidden and `"context-lost"`. An `onStatusChange`
prop is still called with every change.

## Imperative Handle

```tsx
import { useRef } from "react";
import {
  ShaderBackground,
  type ShaderBackgroundHandle
} from "@frapx/react-canvas";

const ref = useRef<ShaderBackgroundHandle>(null);

<ShaderBackground ref={ref} fragment={fragment} />;

ref.current?.stop();
ref.current?.start();
ref.current?.setUniform("intensity", 1);
```

The handle forwards commands to the latest shader instance, so it remains useful
when React recreates the underlying runtime. `setFragment(fragment)` swaps the
shader until the `fragment` prop changes and returns the compile error, or
`null`; only a prop change clears an earlier error. `setTimeSource(source | null)`
holds until the `timeSource` prop is added or removed, or the instance is
recreated (swapping one prop function for another does not undo it).

### Deterministic rendering

`clock` and `resolution` are passed like other options, but changing them
switches the existing instance in place (`setClock` / `setResolution`) instead
of recreating it. `resolution` is compared by value, so an inline array literal
is fine. The handle also exposes `setTime`, `setClock` and `setResolution`:

```tsx
<ShaderBackground
  ref={ref}
  fragment={fragment}
  clock="manual"
  resolution={[1920, 1080]}
/>;

ref.current?.setTime(2);
const png = await ref.current?.captureFrame(); // rejects while nothing is mounted
```

The handle also forwards `resetFeedback()`. See the `@frapx/fx-canvas` README ("Deterministic Rendering") for the
semantics.

`timeSource` follows an external transport such as an audio player, keeping the
offscreen, hidden and reduced-motion gates (see "Following an audio transport"
in the `@frapx/fx-canvas` README). The latest function is called on every
frame, so an inline arrow function neither recreates the instance nor restarts
`u_delta`; removing the prop returns to animation frame time:

```tsx
<ShaderBackground
  fragment={fragment}
  timeSource={() => transport.getPositionMs() / 1000}
/>
```

### Timelines

`uniformSources` binds `UniformSource`s such as `keyframes()` with
`bindUniforms()`. They are applied in array order, so a later source wins for
the same uniform, and their values override `uniforms`. Sources are compared by
identity: an inline array of the same sources does not rebind, a changed list
rebinds on the existing instance, and a recreated instance is bound again.
Create each source once (module scope or `useMemo`).

```tsx
import { keyframes } from "@frapx/fx-canvas";

const timeline = keyframes({ glow: [[0, 0], [2, 1]] });

<ShaderBackground fragment={fragment} uniformSources={[timeline]} />;
```

The handle's `bindUniforms(source)` binds one more source on the current
instance and returns its removal; it is not rebound when the instance is
recreated.

## Notes

- React 18 and newer are supported.
- The package is safe to import during SSR; WebGL work starts only after mount.
- React StrictMode double mounting is handled by destroying the previous runtime
  in effect cleanup.
- Keep `uniforms` and `textures` stable with `useMemo` when they are derived
  from React state.
- The callbacks are named `onShaderReady` and `onShaderError` instead of
  `onReady` and `onError` because the component also accepts the wrapper
  `div`'s props, and `onError` is already the `div`'s DOM error event. The
  hook uses the same names so code moves between the two unchanged.

## Accessibility

The wrapper `div` has `aria-hidden="true"` by default, because a background
effect is decoration that screen readers should skip. When the canvas carries
meaning, such as a chart or the main visual of a page, describe it and
override the default:

```tsx
<ShaderBackground
  fragment={fragment}
  role="img"
  aria-label="Cyan rings pulsing outward on a dark background"
  aria-hidden={false}
/>
```

With the hook, put the same attributes on the element you pass `ref` to.
Consider `respectReducedMotion` as well (see "Lifecycle & accessibility" in the
`@frapx/fx-canvas` README).

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).
