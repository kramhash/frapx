import { createPasses } from "@frapx/fx-passes";
import type { PassesInstance } from "@frapx/fx-passes";
import { registerRenderTarget } from "@frapx/tool-capture";
import { BLOOM, bloomPasses } from "./bloom.glsl";
import { songRhythm } from "./rhythm";
import { LOOP_SECONDS, display, scene } from "./scene.glsl";
import { createSoundtrack } from "./soundtrack";
import "./styles.css";

declare global {
  interface Window {
    // Read by verification scripts.
    __liminalVein?: PassesInstance;
    __liminalVeinTime?: () => number;
  }
}

/** Frame rate of the exported loop, and of `?frame=N`. */
const FPS = 60;
/** Samples a still frame refines to, and the export's default. */
const SAMPLES = 32;
/** Open shutter as a fraction of the frame interval: 180°. */
const SHUTTER = 0.5;
/** Export size unless `frapx-render --resolution` overrides it. */
const EXPORT_RESOLUTION: [number, number] = [1920, 1080];

const stage = document.querySelector<HTMLElement>("[data-stage]")!;
const title = document.querySelector<HTMLElement>("[data-title]")!;
const soundButton = document.querySelector<HTMLButtonElement>("[data-sound]")!;
const errorMessage = document.querySelector<HTMLElement>("[data-error]")!;

// ?frame=N holds frame N of the 60 fps loop and refines it, to check a frame
// without rendering it.
const params = new URLSearchParams(window.location.search);
const stillFrame = params.has("frame") ? Number(params.get("frame")) : null;
const holdsFrame = stillFrame !== null && Number.isInteger(stillFrame) && stillFrame >= 0;

// Set once frapx-render prepares the page, which then always renders at full quality.
let exporting = false;

const prefersLightweightRender = (): boolean =>
  window.matchMedia("(pointer: coarse)").matches ||
  Math.min(window.innerWidth, window.innerHeight) < 700;

const quality = () => (exporting || holdsFrame || !prefersLightweightRender() ? 1 : 0);

// The page starts silent, on fx's realtime clock. The sound button brings the
// song in where the loop is and hands the clock over to it (#48), then returns
// to realtime when the song stops.
const soundtrack = createSoundtrack();

// While playing, every frame draws one sample. A frame that holds still
// (reduced motion, ?frame=N) refines to SAMPLES by itself.
const fx = createPasses({
  target: stage,
  clock: holdsFrame ? "manual" : "realtime",
  // The time wraps every loop, so frame 960 renders exactly like frame 0.
  accumulation: { samples: SAMPLES, shutter: SHUTTER, fps: FPS, loop: LOOP_SECONDS },
  passes: [
    { name: "scene", fragment: scene, accumulate: true, format: "rgba32f", filter: "nearest" },
    ...bloomPasses("scene"),
    { name: "display", fragment: display, inputs: ["scene", BLOOM], filter: "nearest" }
  ],
  uniforms: {
    quality: quality(),
    dither: 1
  },
  dpr: () => Math.min(window.devicePixelRatio, prefersLightweightRender() ? 1 : 1.5),
  maxDpr: 1.5,
  respectReducedMotion: true,
  onResize: ({ instance }) => instance.setUniform("quality", quality()),
  onReady: () => {
    stage.classList.add("is-ready");
    soundButton.hidden = holdsFrame;
    window.setTimeout(() => title.classList.add("is-hidden"), 4000);
  },
  onError: (error) => {
    stage.classList.add("is-unsupported");
    errorMessage.hidden = false;
    console.error(error);
  }
});

// The light, the camera and the cross-section follow the song.
fx.bindUniforms(songRhythm);

soundButton.addEventListener("click", () => {
  soundButton.disabled = true;
  soundtrack
    // Read the instance's time when the song is ready, then hand the
    // clock over to the song (or back to realtime when it stops). Switching
    // sources in realtime mode continues from the new source's current value,
    // so the picture never jumps at either transition.
    .toggle(() => fx.time)
    .then((playing) => {
      const clock = soundtrack.clock();
      fx.setTimeSource(clock ?? null);
      soundButton.setAttribute("aria-pressed", String(playing));
    })
    .catch((error: unknown) => console.error(error))
    .finally(() => {
      soundButton.disabled = false;
    });
});

if (holdsFrame) {
  void fx.ready.then(() => {
    fx.setTime(stillFrame / FPS);
    fx.render();
  });
}

// `frapx-render` (@frapx/tool-render) renders this page headless, at
// EXPORT_RESOLUTION unless --resolution says otherwise: --set spp=N sets the
// samples per frame (default 32), --set shutter=F the open shutter as a
// fraction of the frame (default 0.5), and --set dither=0|1 the dither
// (default on for 8-bit PNG, off for --format png16).
registerRenderTarget(fx, {
  fps: FPS,
  duration: LOOP_SECONDS,
  resolution: EXPORT_RESOLUTION,
  prepare({ params: job, fps, format }) {
    const samples = Number(job.spp ?? SAMPLES);
    if (!Number.isInteger(samples) || samples < 1) {
      throw new RangeError(`spp must be a positive integer, got "${job.spp}"`);
    }
    const shutter = job.shutter === undefined ? SHUTTER : Number(job.shutter);
    if (!Number.isFinite(shutter) || shutter < 0 || shutter > 1) {
      throw new RangeError(`shutter must be between 0 and 1, got "${job.shutter}"`);
    }
    const dither = job.dither ?? (format === "png" ? "1" : "0");
    if (dither !== "0" && dither !== "1") {
      throw new RangeError(`dither must be 0 or 1, got "${dither}"`);
    }
    exporting = true;
    fx.setUniforms({ quality: 1, dither: Number(dither) });
    fx.setAccumulation({ samples, shutter, fps });
  }
});

window.__liminalVein = fx;
window.__liminalVeinTime = () => {
  const clock = soundtrack.clock();
  return clock ? clock() : fx.time;
};
