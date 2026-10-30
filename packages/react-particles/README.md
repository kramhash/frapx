# @frapx/react-particles

React bindings for [`@frapx/fx-particles`](../fx-particles), the WebGL2 GPU
particle runtime. A thin lifecycle adapter: the simulation and render loop stay
in `@frapx/fx-particles`, and the package ships no CSS.

## Install

```sh
pnpm add @frapx/fx-particles @frapx/react-particles
```

## Component

```tsx
import { Particles } from "@frapx/react-particles";

export function Hero() {
  return (
    <section style={{ position: "relative", minHeight: "100vh" }}>
      <Particles
        preset="snow"
        rate={60}
        style={{ position: "absolute", inset: 0 }}
      />
      <h1>Winter sale</h1>
    </section>
  );
}
```

Props are the `createParticles()` options (except `target`, `onReady` and
`onError`), plus the regular `div` attributes for the wrapper. The particle
canvas is transparent; stack it over other content, including a
`@frapx/react-canvas` `<ShaderBackground />`, with CSS.

The wrapper `div` gets `position: relative; overflow: hidden` unless you pass a
`className`, in which case your class styles it alone. It is `aria-hidden`.

### What changes in place

Options are compared by value, so inline arrays and objects such as
`forces={{ curl: { strength: 0.1 } }}` are fine.

- **In place:** the uniform-backed values — `rate`, `opacity`, `twinkle`,
  `perspective` and the force values (`forces.gravity`, `forces.drag`,
  `forces.curl.*`, `forces.pointer.*`) and the `sdf` placement and strengths
  (`sdf.center`, `sdf.size`, `sdf.rotation`, `sdf.attract.*`,
  `sdf.collide.bounce`) — plus `color`, `palette`, `blend`,
  `clock`, `timeSource` and `resolution`. The particles already on screen keep
  going. A `timeSource` is called through a stable wrapper, so an inline arrow
  function is fine.
- **Recreated:** any other change (`preset`, `lifetime`, `size`, `sprite`,
  `emitter`, which forces are present, `sdf.volume` (by identity), which of
  `sdf.attract` / `sdf.collide` are present and `sdf.emit`, `maxParticles`,
  `seed`…), removing one
  of the in-place values (so it falls back to the preset or default), and
  `recreateKey`. A new instance starts again from its prewarmed state.
- **`rate` and the pool:** without `maxParticles` the pool is sized for the
  `rate` at creation. Raising `rate` beyond what it holds (`rate` × the longest
  lifetime) recreates the instance with a larger pool; lowering it stays in
  place. With `maxParticles` the pool is yours and `rate` always changes in
  place.

Under a manual clock, an in-place change of a simulation value replays the
timeline from the start, as `setUniform()` does, so frames stay reproducible.

### Timelines

`uniformSources` binds `UniformSource`s such as `keyframes()` with
`bindUniforms()`. They are applied in array order, so a later source wins for
the same uniform, and their values override the props. Sources are compared by
identity: an inline array of the same sources does not rebind, a changed list
rebinds on the existing instance, and a recreated instance is bound again.
Create each source once (module scope or `useMemo`).

```tsx
import { keyframes } from "@frapx/fx-particles";

const fadeIn = keyframes({ opacity: [[0, 0], [3, 1]] }, { ease: "smooth" });

<Particles preset="fireflies" uniformSources={[fadeIn]} />;
```

## Hook

```tsx
import { useParticles } from "@frapx/react-particles";

export function Sparkles() {
  const { ref, status, error } = useParticles({ preset: "sparkles", rate: 30 });
  return <div ref={ref} aria-hidden="true" style={{ position: "absolute", inset: 0 }} />;
}
```

`useParticles(options, recreateDeps?)` returns `{ ref, instance, status, error }`
and compares `options` the same way as the component. `recreateDeps` forces a
new instance when one of its values changes. An invalid config (a negative
`rate`, an unknown preset) reaches `error` instead of throwing; changing a
value retries.

`status` follows the instance live through `onStatusChange`, including
`"paused"` while offscreen, hidden or under reduced motion, and
`"context-lost"`. An `onStatusChange` prop is still called with every change.

## Imperative Handle

```tsx
import { useRef } from "react";
import { Particles, type ParticlesHandle } from "@frapx/react-particles";

const ref = useRef<ParticlesHandle>(null);

<Particles ref={ref} preset="confetti" clock="manual" resolution={[1920, 1080]} />;

ref.current?.setTime(2);
const png = await ref.current?.captureFrame(); // rejects while nothing is mounted
ref.current?.reset();
```

The handle forwards to the current instance: `start`, `stop`, `render`,
`resize`, `destroy`, `setTime`, `setClock`, `setResolution`, `captureFrame`,
`reset`, `setUniform(s)`, `bindUniforms`, `setColor`, `setPalette`, `setBlend`
and `getInstance()`. Values set through it are replaced by the props the next
time those props change, and are lost when the instance is recreated.
`bindUniforms` returns the removal function (a no-op while nothing is mounted)
and is not rebound on a recreated instance; use `uniformSources` for that. See
the `@frapx/fx-particles` README for the semantics of each.

## Notes

- React 18 and newer are supported.
- Needs WebGL2; without it `status` is `"unsupported"`.
- The package is safe to import during SSR; WebGL work starts only after mount.
- React StrictMode double mounting is handled by destroying the previous
  instance in effect cleanup.
- `onParticlesReady` and `onParticlesError` are used instead of the runtime's
  `onReady` and `onError` to avoid DOM prop naming conflicts.

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).
