# @frapx/fx-passes

WebGL2 multipass shader runtime for video work. It chains Shadertoy-style buffers with float outputs, and accumulates samples deterministically for anti-aliasing and motion blur. It shares its host with [`@frapx/fx-canvas`](../fx-canvas), so the clock, fixed resolution, `captureFrame()` and the lifecycle behave the same way, and [`@frapx/tool-capture`](../tool-capture) exports it as is.

Use `@frapx/fx-canvas` for website backgrounds. Use this package when one pass is not enough or a frame needs many samples.

```sh
pnpm add @frapx/fx-passes
```

```ts
import { createPasses } from "@frapx/fx-passes";

const fx = createPasses({
  target: "#stage",
  resolution: [3840, 2160],
  clock: "manual",
  accumulation: { samples: 64, shutter: 0.5, fps: 60 },
  passes: [
    { name: "scene", fragment: sceneFragment, accumulate: true, format: "rgba32f" },
    { name: "bloom", fragment: bloomFragment, inputs: ["scene"], scale: 0.5 },
    { name: "final", fragment: finalFragment, inputs: ["scene", "bloom"] }
  ]
});

fx.setTime(2);
const pixels = await fx.captureFrame({ format: "rgba16f" });
```

## Passes

Passes are drawn in order every frame. The last pass is shown on the canvas and captured.

- `inputs` lists the passes a pass samples. Each one is a `sampler2D` named `u_<name>`, and its size in pixels is `u_<name>Size`.
- A pass listed **earlier** gives its output from this frame. The pass itself, or a pass listed **later**, gives its output from the **previous** frame, like Shadertoy buffers. Such a pass keeps two buffers automatically, and `resetFeedback()` clears them.
- `format` sets the output storage: `"rgba8"`, `"rgba16f"` (the default) or `"rgba32f"`.
- `scale` sizes the output relative to the canvas, and `u_resolution` is the pass' own size.
- `filter` and `wrap` set how readers sample the output.

Pass names must be GLSL identifiers and may not shadow built-in uniforms. User uniforms (`uniforms`, `setUniform`) and textures (`textures`, `setTexture`) go to every pass that declares them.

## Accumulation

A pass with `accumulate: true` is drawn `accumulation.samples` times per frame. The runtime sums the samples in 32-bit float and passes their mean on to later passes, so the pass' shader only outputs one sample's color. Later passes, such as tone mapping or bloom, run once on the mean.

| Uniform | In accumulating passes |
| --- | --- |
| `u_time` | The sample's moment within the open shutter, `[time, time + shutter / fps)` |
| `u_frameTime` | The frame's time |
| `u_jitter` | Sub-pixel offset in pixels, each component in [-0.5, 0.5); add it to `gl_FragCoord.xy` |
| `u_sampleIndex` / `u_sampleCount` | The sample's index, and the samples in the frame |

Because `u_time` moves within the shutter, a shader that depends only on time gets motion blur without changes. Uniforms bound with `bindUniforms(source)` (for example `keyframes()`, re-exported here) are evaluated at each sample's time too, so a keyframed camera blurs the same way; later passes see the frame's time. A source that returns new values for the same time (an edited timeline) restarts the frame's samples on the next `render()`. Samples follow a low-discrepancy (R3) sequence, so the same frame always gives the same pixels. Sample 0 has no jitter and opens the shutter, so one sample is the plain frame. Outside accumulating passes, `u_time` equals `u_frameTime`, `u_jitter` is zero and `u_sampleCount` is 1.

**Seamless loops.** Set `accumulation.loop` to the loop's length in seconds and every pass sees the time wrapped into `[0, loop)`: `u_frameTime`, `u_time` and the time bound uniforms are evaluated at. The runtime adds each sample's shutter offset to the wrapped time in double precision before uploading it, so a frame one loop later (frame 960 of a 16 s loop at 60 fps) is identical to the bit with any number of samples. Without it, `u_time` keeps growing, and a 32-bit float rounds the sample times near 16 s differently than near 0. Adding the offset in the shader does not fix that reliably, since GPU compilers may reorder the arithmetic.

- **Preview.** While the frame's inputs (time, uniforms, textures, size) stay the same, each draw adds one sample until `samples` is reached, and a change starts over. A running realtime loop therefore shows one sample per frame. A stopped or manual-clock instance keeps refining the still frame on animation frames by itself. Progress is in `samplesDrawn` and `onSample`.
- **Capture.** `captureFrame()` always draws every sample of the frame from scratch, waiting for the GPU between batches so long frames never trip the browser's GPU watchdog. Then it runs the remaining passes and reads the last one. A capture's `signal` is checked between samples. Uniform, accumulation and feedback changes made while it draws apply to the next frame.

Accumulating passes must come first in the list. They may only read passes listed after them, which gives those passes' previous-frame output.

## Timelines

`bindUniforms(source)` drives uniforms from a timeline such as `keyframes()`, re-exported here. Accumulating passes evaluate it at every sample's time within the shutter, so a keyframed camera is motion blurred like `u_time`; later passes see the frame's time. Values override `setUniform()`, and a later source wins over an earlier one. See `examples/vite-timeline`.

## Hot reloading

`setFragment(name, source)` swaps one pass' fragment shader. The pass keeps its buffers, format and inputs, and the time, uniforms and textures carry over; the frame's samples start over. Like `@frapx/fx-canvas`, a compile error is returned (and passed to `onError`) rather than thrown, with the located lines in `error.lines`, and the previous shader keeps drawing. A swap during `captureFrame()` applies from the next frame. Changing the pass list, formats or inputs needs a new instance.

## Instance

| Member | |
| --- | --- |
| `canvas`, `gl`, `status`, `supported`, `ready`, `clock` | As in `@frapx/fx-canvas` |
| `accumulation`, `samplesDrawn` | The resolved accumulation settings, and the samples of the current frame drawn so far |
| `start()`, `stop()`, `render()`, `resize()`, `destroy()` | Lifecycle. `render()` at an unchanged time adds the next sample |
| `setTime(seconds)`, `setClock(clock)`, `setTimeSource(source)`, `setResolution(size)` | Clock and size, as in `@frapx/fx-canvas`. With a `timeSource`, the realtime loop shows one sample per frame at the source's time, as it does without one |
| `setAccumulation(options)` | Changes `samples`, `shutter`, `fps` or `loop` and restarts the frame's samples |
| `captureFrame(options)` | Draws every sample of the current frame and reads the last pass |
| `resetFeedback()` | Clears the previous-frame outputs |
| `setFragment(name, source)` | Swaps one pass' shader (see Hot reloading) |
| `bindUniforms(source)` | Drives uniforms from a timeline such as `keyframes()` (see Timelines) |
| `setUniform()`, `setUniforms()`, `setTexture()`, `setTextures()` | Change user uniforms and textures. Uniforms set during a capture apply to the next frame; a texture applies once it loads |

`onResize(state)` runs whenever the render size actually changes, as in `@frapx/fx-canvas`: not on setup, but also after `setResolution()`, and after the capture when requested during `captureFrame()`. `state` carries the instance, `gl`, the canvas and its new `width` / `height`. The pass buffers take the new size on the next draw.

`onStatusChange(status)` runs with the new value each time `status` changes (for example `"paused"` in a hidden tab, or `"context-lost"`), with the same rules as `@frapx/fx-canvas`: never for the initial `"idle"`, nor before `createPasses()` returns, and calling `destroy()` from it is safe.

`respectReducedMotion` defaults to `true`, as in `@frapx/fx-canvas`: while the OS "reduce motion" setting is on, the loop holds a still frame (still refined up to `accumulation.samples`). Pass `respectReducedMotion: false` to keep animating.

## Requirements

WebGL2 with `EXT_color_buffer_float`. Without it, `status` is `"unsupported"` and `ready` rejects with `UnsupportedError`. Shaders may be GLSL ES 1.00 or 3.00, chosen per pass. Samples are summed with additive blending when `EXT_float_blend` is available, and with an extra pass otherwise.

## License

MIT
