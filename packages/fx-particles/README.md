# @frapx/fx-particles

[![npm version](https://img.shields.io/npm/v/@frapx/fx-particles.svg)](https://www.npmjs.com/package/@frapx/fx-particles)

WebGL2 GPU particles for website backgrounds: snow, dust, sparkles, bubbles, fireflies and confetti from a declarative config. The simulation runs on the GPU with transform feedback, so tens of thousands of particles cost almost nothing on the main thread. It shares its host with [`@frapx/fx-canvas`](../fx-canvas), so the lifecycle, fixed `resolution`, manual clock and `captureFrame()` behave the same way, and [`@frapx/tool-capture`](../tool-capture) and [`@frapx/tool-render`](../tool-render) export it frame by frame.

```sh
pnpm add @frapx/fx-particles
```

```ts
import { createParticles } from "@frapx/fx-particles";

const particles = createParticles({
  target: ".hero",
  layer: "overlay",
  preset: "snow",
  forces: { pointer: { strength: 0.6, radius: 0.18 } }
});
```

The particles draw into their own transparent canvas. To put them over an `fx-canvas` background on the same element, create both and give the particles `layer: "overlay"`.

It needs WebGL2; without it `status` is `"unsupported"` and nothing is drawn. Importing it is safe during SSR.

In a React app, use [`@frapx/react-particles`](../react-particles) for a `<Particles />` component and a `useParticles()` hook.

## Presets

`preset` is a starting point; every other option is merged over it. `forces`, `emitter` and `velocity` merge field by field, so `forces: { pointer: {} }` adds a pointer push to a preset's own forces.

| Preset | Look |
| --- | --- |
| `dust` | Faint motes drifting in curl noise |
| `snow` | Flakes falling with depth parallax |
| `sparkles` | Twinkling four-point glints |
| `bubbles` | Rings rising and wobbling from the bottom |
| `fireflies` | Slow, pulsing green-yellow glows |
| `confetti` | Tumbling colored paper falling from the top |

The preset configs are exported as `presets` to read or extend.

## Options

Lengths are in viewport heights (1 is the canvas' height) and times in seconds. Particles live in a 2.5D space: x and y on screen, and a depth from 0 (near) to 1 (far) that makes them smaller, dimmer and slower.

| Option | Default | |
| --- | --- | --- |
| `rate` | 20 | Particles spawned per second |
| `lifetime` | `[2, 4]` | Lifetime range |
| `emitter.area` | `[0, 0, 1, 1]` | Spawn rectangle `[x0, y0, x1, y1]` in viewport UV, y up; outside 0–1 spawns off-screen |
| `emitter.depth` | `[0, 0]` | Depth range |
| `velocity.min` / `max` | `[0, 0, 0]` | Initial velocity, random per axis |
| `forces.gravity` | — | Constant acceleration `[x, y, z]` |
| `forces.drag` | — | Velocity damping per second |
| `forces.curl` | — | `{ strength, scale, speed }` (defaults 0.1, 1, 0.1): divergence-free swirl ([`curl3d`](../glsl-noise#curl-noise)) |
| `forces.pointer` | — | `{ strength, radius }` (defaults 0.5, 0.2): push from the pointer; negative strength pulls |
| `sdf` | — | Follow a baked SDF (WebGL2): attract to it, collide with it, spawn from it. See [Following a baked SDF](#following-a-baked-sdf) |
| `size` | `[0.01, 0.02]` | Diameter range |
| `sizeOverLife` | `"constant"` | `"fadeIn"`, `"fadeOut"` or `"fadeInOut"` |
| `color` | white | A hex color, or stops over life: `["#fff0", "#fff", "#fff0"]` or `[[0.2, "#fff"], ...]` |
| `palette` | — | Hex colors picked at random per particle, multiplied with `color` |
| `opacity` | 1 | Overall alpha |
| `sprite` | `"soft"` | `"soft"`, `"disc"`, `"ring"`, `"square"`, `"glint"`, or an image (URL, element or texture options) |
| `spin` | `[0, 0]` | Rotation speed range in radians per second |
| `tumble` | `false` | Flips the sprite as it spins, like paper |
| `twinkle` | 0 | Random flicker, 0–1 |
| `blend` | `"additive"` | `"additive"` for light, `"normal"` to paint over |
| `perspective` | 1.5 | Depth scale: `1 / (1 + depth * perspective)` |
| `maxParticles` | initial `rate` × longest lifetime × 1.25 (at least 16) | Pool size, fixed at creation. Raise it if you raise `rate` later: when the pool runs out, the oldest particles are recycled before their lifetime ends (`debug` warns once) |
| `simulationRate` | 60 | Simulation steps per second |
| `prewarm` | longest lifetime | Seconds simulated before time 0, so the first frame is already full; 0 starts empty |
| `seed` | 1 | Seed for every random choice |
| `format` | `"rgba8"` | `"rgba16f"` draws into a half-float buffer for 16-bit capture (needs `EXT_color_buffer_float`; `formatFallback: false` fails instead of falling back) |

The host options are the same as `fx-canvas`: `target`, `canvas`, `layer`, `resolution`, `dpr`, `maxDpr`, `autoResize`, `autoStart`, `pauseWhenOffscreen`, `pauseWhenHidden`, `respectReducedMotion`, `clock`, `timeSource`, `debug`, `canvasClass`, `canvasStyle`, `onReady`, `onError` and `onStatusChange`. `respectReducedMotion` defaults to `true`, as in `fx-canvas`: a reduced-motion user sees a still frame, on load the prewarmed first one. Pass `respectReducedMotion: false` to keep animating. `onStatusChange(status)` runs with the new value each time `status` changes, with the same rules as `fx-canvas`.

Which forces exist, the pool, the sprite, `sizeOverLife` and `tumble` are compiled into the shaders, so changing them means creating a new instance.

## Changing values while running

These values are uniforms. `setUniform(name, value)` changes one, and `bindUniforms(source)` drives them from a timeline such as `keyframes()` (re-exported here):

- Simulation: `rate`, `gravity`, `drag`, `curlStrength`, `curlScale`, `curlSpeed`, `pointerStrength`, `pointerRadius`, `perspective`, `sdfCenter`, `sdfSize`, `sdfRotation`, `sdfAttractStrength`, `sdfAttractFalloff`, `sdfBounce`
- Drawing only: `opacity`, `twinkle`

A force's uniforms only exist when that force was configured at creation: without `forces.curl`, setting `curlStrength` has no effect (`debug` warns).

```ts
import { createParticles, keyframes } from "@frapx/fx-particles";

const particles = createParticles({
  target: ".hero",
  preset: "confetti",
  // The pool is sized from the starting rate; leave room for the peak.
  maxParticles: 1200
});

particles.bindUniforms(
  keyframes({
    rate: [
      [0, 0],
      [2, 120],
      [6, 0]
    ],
    gravity: [
      [0, [0, -0.1, 0]],
      [4, [0.3, -0.1, 0]]
    ]
  })
);
```

`setColor()`, `setPalette()` and `setBlend()` change the look without touching the simulation.

## Following a baked SDF

`sdf` makes the particles follow a mesh baked in Blender with the [3dsdf-texture](https://github.com/kramhash/3dsdf-texture) extension and loaded with [`@frapx/glsl-sdf-volume`](../glsl-sdf-volume) — the "particles form the object" effect.

```ts
import { createParticles } from "@frapx/fx-particles";
import { loadSdfVolume } from "@frapx/glsl-sdf-volume";

const volume = await loadSdfVolume("/sdf/logo.r16f.sdf.ktx2");

createParticles({
  target: ".hero",
  rate: 2500,
  lifetime: [8, 12],
  emitter: { depth: [0, 1] },
  forces: { drag: 3 },
  sdf: {
    volume,
    center: [0.5, 0.5, 0.5], // viewport UV and depth of the shape's center
    size: 0.9, // longest box side, in viewport heights
    rotation: [0, 0.4, 0], // Euler radians, applied x, then y, then z
    attract: { strength: 24 }, // spring onto the surface; pair with drag
    collide: { bounce: 0.2 } // keep out of the shape
    // emit: "surface" | "inside" spawns from the shape instead of `emitter`
  }
});
```

| Field | Default | Uniform | |
| --- | --- | --- | --- |
| `volume` | — | — | From `loadSdfVolume()` |
| `center` | `[0.5, 0.5, 0.5]` | `sdfCenter` | Where the shape's center shows: viewport UV (y up) and depth |
| `size` | 0.5 | `sdfSize` | Longest side of the shape's box, in viewport heights. Depth uses the same units |
| `rotation` | `[0, 0, 0]` | `sdfRotation` | Euler radians, applied x, then y, then z |
| `attract.strength` | 8 | `sdfAttractStrength` | Acceleration per unit of distance from the surface, from both sides |
| `attract.falloff` | 0 | `sdfAttractFalloff` | Distance at which the pull fades out; 0 pulls from anywhere |
| `collide.bounce` | 0 | `sdfBounce` | Particles inside are moved onto the surface and keep this fraction of their inward speed |
| `emit` | — | — | `"surface"` or `"inside"` (16 tries in the box, then the surface) instead of `emitter` |

Which of `attract`, `collide` and `emit` are present is compiled into the simulation. The placement and strengths are uniforms, so `setUniform("sdfRotation", …)` or a `bindUniforms()` timeline turns the shape, and the manual clock stays reproducible. An `r8` volume stores distances only within a few voxels of the surface. Farther in its box, particles head for the box center until they reach that band, so prefer `r16f` when particles start far inside the box.

## Time, determinism and export

The simulation advances in fixed steps of `1 / simulationRate` seconds, and the frame at time `t` shows the state after `floor(t * simulationRate)` steps from the prewarmed start, however many frames were drawn on the way. A manual clock always holds to this; a realtime clock does unless it has to drop time:

- **Realtime clock.** Each frame runs the steps its elapsed time covers. A frame that falls far behind (a slow device, a restored context) runs up to 4 steps and drops the rest of the time instead of stalling. `setTime()` lands exactly; going back replays from the start.
- **Realtime clock with a `timeSource`.** Each frame takes its time from the source (see "Following an audio transport" in the `fx-canvas` README). A jump in the source is not a seek: going forward runs up to 4 steps and drops the rest, as after a slow frame, and going back (a loop or a seek) restarts from the prewarmed start. Since prewarming always completes, the frame is never empty, and no frame costs more than the prewarm plus 4 steps however far the source jumps. A transport that loops back to within 4 steps of 0 therefore lands exactly. `setTime()` has no lasting effect while a source is set.
- **Manual clock.** `setTime(t)` then `render()` or `captureFrame()` runs every step up to `t`; going back replays from the start. A frame is therefore the same whether it was reached directly, frame by frame or after rewinding, so `@frapx/tool-render` can split a render into ranges. Uniform values apply to the whole timeline: changing a simulation uniform with `setUniform()`, or binding or removing a source with `bindUniforms()`, replays from the start, and so does a new canvas size, since spawns are placed by aspect ratio. Changing `opacity` or `twinkle` only redraws. In a bound timeline, simulation uniforms are evaluated at every step's own time and drawing uniforms at the frame's time. The pointer has no effect, and switching to the manual clock starts over.

Replaying is cheap per step but adds up: a frame 10 minutes in at 60 steps per second runs 36,000 steps. `captureFrame()` runs a long catch-up in batches with GPU waits in between, so it never trips the browser's GPU watchdog.

Export at a frame rate that divides `simulationRate`. At 60 steps per second, 30 and 60 fps advance evenly but 24 fps alternates 2 and 3 steps per frame. `simulationRate: 120` suits 24, 30 and 60 fps.

```ts
import { createParticles } from "@frapx/fx-particles";
import { registerRenderTarget } from "@frapx/tool-capture";

const particles = createParticles({ target: "#stage", preset: "confetti", format: "rgba16f" });
registerRenderTarget(particles, { fps: 30, duration: 10 });
// frapx-render http://localhost:5173 --out frames --format png16
```

The capture holds the particle layer alone, with alpha, to composite over other footage. `"png"` and `"rgba16f"` captures are straight (not premultiplied) alpha; `"rgba8"` is the canvas as stored, premultiplied.

## API

`createParticles(options)` returns:

| Member | |
| --- | --- |
| `canvas`, `gl`, `status`, `supported`, `ready`, `clock` | As in `fx-canvas` |
| `maxParticles`, `simulationRate` | The pool size and step rate in use |
| `start()`, `stop()`, `render()`, `resize()`, `destroy()` | Lifecycle |
| `setTime(seconds)`, `setClock(clock)`, `setTimeSource(source)`, `setResolution(size)` | Clock and size |
| `captureFrame(options)` | Draws and reads the current frame |
| `reset()` | Restarts from the prewarmed start on the next frame |
| `setUniform()`, `setUniforms()`, `bindUniforms()` | Change the values above |
| `setColor()`, `setPalette()`, `setBlend()` | Change the look |

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).
