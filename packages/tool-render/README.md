# @frapx/tool-render

Command-line rendering for pages built with `@frapx/fx-canvas`, `@frapx/fx-passes` or `@frapx/fx-particles`: `frapx-render` opens the page in headless Chrome, renders a frame range through `@frapx/tool-capture`, and writes `frame_00000.png`, `frame_00001.png`, … to a folder. No browser tab has to stay open, an interrupted render picks up where it stopped, and the frames can be encoded to ProRes or H.264 with ffmpeg at the end.

## Install

```sh
pnpm add -D @frapx/tool-render
```

Needs Node 20 or later and an installed Google Chrome (or `npx playwright install chromium` for `--browser chromium`). `--encode` needs `ffmpeg` on `PATH`, and `--audio` also `ffprobe`.

## Prepare the page

Register the instance with `registerRenderTarget()` from `@frapx/tool-capture`. It only sets a global, so it is safe to leave in a production build:

```ts
import { createPasses } from "@frapx/fx-passes";
import { registerRenderTarget } from "@frapx/tool-capture";

const fx = createPasses({ target: stage, clock: "manual", resolution: [1920, 1080], passes });

registerRenderTarget(fx, {
  fps: 30,
  duration: 24, // seconds; the default range is frames 0..719
  resolution: [1920, 1080], // the default size; --resolution overrides it
  prepare({ params }) {
    // --set spp=192 arrives here as a string.
    fx.setAccumulation({ samples: Number(params.spp ?? 64) });
  }
});
```

`prepare()` runs before each render job (and again after the page is reopened), with the command line's `params`, `fps` and `format`, and the size the job renders at (`--resolution`, else the page's `resolution`). Pass a getter, `registerRenderTarget(() => fx, …)`, when the page replaces its instance; `prepare()` may do so. The size is applied after `prepare()`. A page that declares no `resolution` and gets no `--resolution` renders at its own size, which headless is the 1280 × 720 viewport; the CLI prints the size it renders at when it starts.

## Render

Build the page and render its output directory:

```sh
vite build
frapx-render dist --out renders/loop --resolution 3840x2160 --set spp=192 --encode prores
```

When the page to render is a route of the app, such as `/music`, pass it with `--path`: `frapx-render dist --path /music --out renders/music`. The directory server falls back to `dist/index.html` for a missing route without a file extension, as single-page apps expect; a missing file with an extension (`/assets/missing.js`) stays a 404.

A URL works too (`frapx-render http://127.0.0.1:5173/music --out …`; put the route in the URL, `--path` is for directories). Prefer a build for long renders: a dev server's hot reload replaces the page mid-render, which `frapx-render` detects and stops on, since later frames would come from different code. `frapx-render` connects to exactly the host in the URL. `vite preview` and `vite dev` listen on `localhost` only, which may resolve to IPv6 (`::1`), so `http://127.0.0.1:…` can be refused while `http://localhost:…` works; use the address the server prints, or start it with `--host 127.0.0.1`.

| Option | Default | |
| --- | --- | --- |
| `-o, --out <dir>` | required | Output directory. |
| `--path <route>` | `/` | Route to open in a directory source, e.g. `/music` or `/music?take=2`. |
| `-r, --range <a-b>` | the page's `duration` | Inclusive frame range, or a single frame. |
| `--fps <n>` | the page's `fps` | Frame `n` is drawn at `n / fps` seconds. |
| `--resolution <WxH>` | the page's `resolution`, else its size (headless: 1280 × 720) | Render size, e.g. `2560x1440` or `2048x1080`. |
| `--format <png\|png16>` | `png` | 8-bit, or 16-bit from the float buffer (the page must provide one; see `@frapx/tool-capture`). |
| `-s, --set <key=value>` | | Passed to `prepare()`. Repeatable. |
| `--resume` | | Continue a render in `--out`. |
| `--encode <prores\|h264>` | | Encode the range with ffmpeg afterwards. Repeatable. |
| `--audio <file>` | | Mux this audio into each encoded video, cut to the range. Needs `--encode`. |
| `--strict-audio` | | Stop before rendering when the audio and the page's `duration` differ by more than a frame. |
| `--browser <chrome\|chromium>` | `chrome` | Installed Google Chrome, or Playwright's Chromium. |
| `--headed` | | Show the browser window. |
| `--allow-software` | | Render on a software WebGL renderer such as SwiftShader. |
| `--timeout <seconds>` | `60` | How long to wait for `registerRenderTarget()`. |
| `-h, --help` | | Print the usage text and exit. |
| `-v, --version` | | Print the version and exit. |

Progress goes to stderr with the time per frame and an estimate of the time left. Ctrl-C stops after closing the browser (press it again to quit at once) and exits with 130.

### Resuming and failures

- Each frame is written to a temporary file and renamed, so an interrupted render never leaves a truncated PNG.
- `--out` gets a `frapx-render.json` with the settings that decide what a frame looks like: the source, the `--path` route, `fps`, `format`, `resolution` and `params`. `--resume` renders only the frames of the range that are missing, and refuses when any of those settings differ. Without `--resume`, a folder that already holds frames is refused.
- When the page crashes or loses its WebGL context, `frapx-render` opens it again and continues with the next missing frame. The frame written just before a lost context is rendered again, since it may be blank. Three failures in a row without progress stop the render.
- A page that reloads or navigates to a new document stops the render; `history.pushState()` and hash changes do not.
- Frame requests bypass service workers, so PWA builds render too.

Split a long render across runs or machines with `--range`: frame numbers set both the file names and the time, so for shaders that depend only on time the parts line up (feedback history does not carry over between runs).

### GPU

`frapx-render` prints the WebGL renderer before rendering and stops when it is a software renderer (SwiftShader, llvmpipe), which would be far too slow for real work; pass `--allow-software` for CI. On an Apple Silicon Mac, headless Chrome renders on the Metal GPU; elsewhere, check the printed renderer, and try `--headed` if headless falls back to software.

### Encoding

`--encode prores` writes `<out>/<folder name>.mov` (ProRes 422 HQ, 10-bit 4:2:2), and `--encode h264` writes `<out>/<folder name>.mp4` (CRF 16, `yuv420p`, `+faststart`). Both convert the full-range RGB frames to limited-range BT.709 and tag the stream as BT.709. An odd width or height gains one row or column of black, since 4:2:0 and 4:2:2 video need even sizes. Run ffmpeg yourself for anything else:

```sh
ffmpeg -framerate 30 -i frame_%05d.png \
  -vf "scale=out_color_matrix=bt709:out_range=tv,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv" \
  -c:v prores_ks -profile:v 3 -vendor apl0 -pix_fmt yuv422p10le out.mov
```

`setparams` matters: without it, ffmpeg 8 tags the color primaries and transfer as unknown.

### Audio

`--audio music.wav` muxes a soundtrack into every `--encode` output: PCM 24-bit in the ProRes `.mov`, AAC 320 kb/s in the H.264 `.mp4`. The audio is cut to the rendered range, from `first / fps` for `(last - first + 1) / fps` seconds, so `--range 120-239` at 30 fps carries 4–8 s of the file. The AAC encoder delay is compensated by the MP4 edit list, so the audio stays on the frames.

```sh
frapx-render dist --path /music --out renders/music --set spp=16 --encode h264 --audio public/music.wav
```

Before rendering, `frapx-render` reads the file with `ffprobe`, refuses it when it has no audio stream, and compares its duration with the page's `duration`. More than one frame apart prints a warning (a `warning` event in the API). `--strict-audio` stops instead, so a file exported a few milliseconds short does not end up as a video whose picture drifts against the sound on every loop. The CLI does not know the tempo: check that the beats sit on the grid in your own tooling. `--audio` does not change the frames, so `--resume` does not compare it. `frapx-render.json` records it for reference.

## API

The CLI is a thin wrapper around `render(options, { signal, onEvent })`, exported for scripts. `options` mirrors the flags (`source`, `path`, `out`, `range`, `fps`, `resolution`, `format`, `params`, `resume`, `encode`, `audio`, `strictAudio`, `browser`, `headed`, `allowSoftware`, `timeout`); `onEvent` receives `start`, `frame`, `retry`, `page-error`, `warning` and `encode` events. It resolves with `{ out, range, rendered, videos }`.

`parseCliArgs(argv)` turns `frapx-render` arguments into `{ kind: "run", options }` (or `{ kind: "help" }` / `{ kind: "version" }`) for scripts that accept the same flags, and throws `UsageError` for invalid ones.

## Example

`examples/vite-poolrooms` registers itself; see its README for a 4K render of the full loop.
