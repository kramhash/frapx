# LIMINAL VEIN

A seamless 15-second loop, set to its own song, through a quiet tunnel of ribs
lit only by a few glowing rings and the rare vein. Through the song's calm the
camera drifts; in its drop every kick throws it forward and turns the tunnel's
cross-section from circle to hexagon to star, until the last bar settles back.
Drawn with `@frapx/glsl-sdf` and `@frapx/glsl-raymarch` on `@frapx/fx-passes`.
The same page plays in real time and renders the loop frame by frame, with the
song, with `@frapx/tool-render`.

```sh
pnpm --filter @frapx/example-vite-liminal-vein dev
```

Needs WebGL2 with `EXT_color_buffer_float`. The page starts silent; the
**Sound** button brings the song in where the loop is.

## How a frame is made

- `scene` marches one ray in linear light and accumulates. The walls take
  their light only from the glowing rings, so what the rings do not reach
  stays dark. The walls and ribs are drawn around a circle in a cross-section
  stretched along every angle, which is how it turns into a hexagon or a star.
- Once per frame, on the mean of the samples: bloom as plain
  `@frapx/fx-passes` passes (halvings down to 1/64 and back up, in
  `src/bloom.glsl.ts`), then `display` adds it and applies the vignette, an
  ACES tone curve and dither.
- Playing draws one sample per frame. A frame that holds still (reduced
  motion, or `?frame=N`) refines to 32 samples. Each sample moves `u_time`
  within a 180° shutter and the ray within the pixel (`u_jitter`), so the mean
  is motion blurred and anti-aliased.
- Everything that varies along the tunnel, the bend included, repeats every
  loop distance, and the camera covers exactly one loop distance per loop, so
  it wraps from the end of the loop to its start without a jump.
  `accumulation.loop` wraps the time itself, so frame 900 renders identically
  to frame 0, to the bit.

## The song

`audio/music.wav` is 8 bars at 128 BPM, 4/4, beat 1 at sample 0: bars 1–4 are
the calm, bars 5–8 the drop. `src/rhythm.ts` turns it into uniforms, bound
with `bindUniforms()`, as a pure function of time, so a frame renders the same
however it is reached and every sample sees the song at its own time:

- `flash` (the kick, gone in ~80 ms), `pulse` (its afterglow) and `hat`, each
  decaying since it fired; `energy`, the bar's loudness; `drop`, 0 in the calm
  and 1 in the drop.
- `travel`, `shape` and `kickRoll`: the camera's way through the loop, the
  cross-section and a kick's roll, worked out from the beats.

The kick is four on the floor, written in `rhythm.ts` because the mix hides it
from analysis. The hats and the bar loudness come from the WAV:

```sh
python3 -I scripts/check-wav.py audio/music.wav     # length, grid offset, peak
python3 -I scripts/analyze-wav.py audio/music.wav src/song.analysis.json
```

The browser plays `public/music.m4a`, made from the WAV:

```sh
ffmpeg -i audio/music.wav -c:a aac_at -b:a 160k -movflags +faststart public/music.m4a
```

While the song plays its position is the page's `timeSource`
(`src/soundtrack.ts`), so the picture follows what is heard.

`?frame=N` holds frame N of the 60 fps loop at full quality, to check a frame
without rendering it.

## Rendering the loop

```sh
pnpm --filter @frapx/example-vite-liminal-vein build
pnpm --filter @frapx/tool-render build
node packages/tool-render/dist/cli.js examples/vite-liminal-vein/dist \
  --out renders/liminal-vein --format png16 --encode prores --encode h264 \
  --audio examples/vite-liminal-vein/audio/music.wav --strict-audio
```

The page renders 900 frames (15 s at 60 fps) at 1920 × 1080 with 32 samples
by default, about 0.8 s per frame on an M4 Max. `--audio` muxes the song into
the encoded videos; `--strict-audio` stops before rendering if its length is
not the loop's.

- `--resolution 3840x2160` renders another size (4K takes about 1.5 s per
  frame on an M4 Max); `--fps 30` another rate (the loop stays 15 s).
- `--set spp=64` changes the samples per frame, `--set shutter=0` turns motion
  blur off.
- Dither is on for 8-bit PNG and off for `--format png16`; `--set dither=0|1`
  overrides it.
- Interrupted? Run the same command with `--resume`.

## License

The code is under the repository's MIT License. The music (`audio/music.wav`,
`public/music.m4a`) is by kramhash under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see
`audio/LICENSE`.
