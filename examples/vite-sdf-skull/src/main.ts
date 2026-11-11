import { createShaderBackground, glsl, type ShaderBackgroundInstance } from "@frapx/fx-canvas";
import { raymarch, raymarchCamera, raymarchCameraUniforms } from "@frapx/glsl-raymarch";
import { sdf3d, sdfDomain, sdfOps } from "@frapx/glsl-sdf";
import { loadSdfVolume, sdfVolume } from "@frapx/glsl-sdf-volume";
import { registerRenderTarget } from "@frapx/tool-capture";
import { decompress } from "fzstd";
import "./styles.css";

declare global {
  interface Window {
    // Read by verification scripts.
    __sdfSkull?: ShaderBackgroundInstance;
  }
}

// Khronos' ScatteringSkull baked by the 3dsdf-texture Blender extension into a
// r16f 3D distance texture (Zstandard). The shader treats it as one more
// distance function. Over an 8-bar loop at 128 BPM, orbiting spheres
// smooth-union into it on the beat, then spines grow straight out of it from
// the drop and move on the beat while the skull rounds into a sea urchin under
// them, then everything returns.
//
// Time alone decides the frame (15 s at 128 BPM), so frapx-render exports it.
// The pointer only nudges the camera. `?still=<seconds>` draws one frame.

/**
 * Tempo. At 60 fps the loop is a whole number of frames only when
 * LOOP_BEATS * 3600 / BPM is whole (for 8 bars: 120, 128 and 144 work; 140 does not).
 */
const BPM = 128;
/** Bars of 4/4 in the loop: four calm bars of spheres, then four of spines. */
const LOOP_BARS = 8;
const LOOP_BEATS = LOOP_BARS * 4;
/** Length of the loop in seconds (15 s at 128 BPM). */
const LOOP_SECONDS = (LOOP_BEATS * 60) / BPM;

/** A number as a GLSL float literal: 15 becomes "15.0", 13.333… keeps every digit. */
const glslFloat = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

const fragment = glsl`#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

uniform highp sampler3D u_sdf;
uniform vec3 u_sdfMin;
uniform vec3 u_sdfMax;
uniform float u_sdfScale;
uniform float u_sdfOffset;

out vec4 fragColor;

#define FRAPX_RAYMARCH_STEPS 160
#define FRAPX_SHADOW_STEPS 32
#define PI 3.14159265
#define BPM ${glslFloat(BPM)}
#define LOOP_BEATS ${glslFloat(LOOP_BEATS)}
#define LOOP ${glslFloat(LOOP_SECONDS)}
// The bake is in metres (the skull is 0.36 long); scale it to about 1.8 units.
#define SKULL_SCALE 5.0
// Rings of latitude the spines sit on, pole to pole.
#define RINGS 9.0
// Radius the skull rounds into.
#define BODY_RADIUS 0.68
// Spines start inside the body so they always grow out of the surface.
#define SPINE_ROOT 0.3
// Shortest a spine sways to, as a fraction of its full length from the root
// (about 40% of the part outside the body).
#define SPINE_SHORTEST 0.6
// Beats between a spine's moves to a new length.
#define SPINE_SWAY_BEATS 2.0
// Beats a move takes to settle into the new length.
#define SPINE_SETTLE_BEATS 1.0
// Beats the spines take to grow out of the skull from the drop.
#define SPINE_GROW_BEATS 4.0

${sdf3d}
${sdfOps}
${sdfDomain}
${sdfVolume}
${raymarchCamera}
${raymarchCameraUniforms}
${raymarch}

// Timeline state, set once per pixel in main() and read by frapx_map.
float g_beat;
float g_spin;
float g_spheres;
float g_spines;
float g_round;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Cubic ease-out on [0, 1]: fastest at 0, so a move that starts on a beat
// peaks on it.
float easeOut(float u) {
  float v = 1.0 - u;
  return 1.0 - v * v * v;
}

// The mesh is not centred in its own space: put the middle of its box at the origin.
float skull(vec3 p) {
  vec3 q = p / SKULL_SCALE + 0.5 * (u_sdfMin + u_sdfMax);
  return SKULL_SCALE * frapx_sdVolume(u_sdf, q, u_sdfMin, u_sdfMax, u_sdfScale, u_sdfOffset);
}

// One spine of a latitude ring: a cone from SPINE_ROOT out along its
// direction, its length varied per spine and swaying over time. Of the two
// cells on either side of p's azimuth, side 0 takes the one before p and
// side 1 the one after.
float spineOnRing(vec3 p, float ring, float side) {
  float theta = ring * PI / (RINGS - 1.0);
  float count = max(1.0, floor(2.0 * sin(theta) * (RINGS - 1.0) + 0.5));
  float cell = 2.0 * PI / count;
  // Stagger every other ring so neighbours do not line up.
  float offset = mod(ring, 2.0) * 0.5 * cell;
  float index = floor((atan(p.z, p.x) - offset) / cell) + side;
  float angle = index * cell + offset;
  vec3 dir = vec3(sin(theta) * cos(angle), cos(theta), sin(theta) * sin(angle));

  float id = ring * 31.0 + mod(index, count);
  float full = 0.42 + 0.68 * (0.7 + 0.6 * hash11(id));
  // Every SPINE_SWAY_BEATS a spine moves to a new random length, half of them
  // on even beats and half on odd. A move starts fastest on its beat and eases
  // into the new length over SPINE_SETTLE_BEATS.
  float group = floor(2.0 * hash11(id + 0.25));
  float move = floor((g_beat - group) / SPINE_SWAY_BEATS);
  float settle = easeOut(clamp((g_beat - group - move * SPINE_SWAY_BEATS) / SPINE_SETTLE_BEATS, 0.0, 1.0));
  float sway = mix(SPINE_SHORTEST, 1.0, mix(hash21(vec2(id, move - 1.0)), hash21(vec2(id, move)), settle));
  float tip = SPINE_ROOT + g_spines * full * sway;
  float halfLength = 0.5 * (tip - SPINE_ROOT);
  float h = dot(p, dir);
  float r = length(p - dir * h);
  return frapx_sdCappedCone(vec3(r, h - SPINE_ROOT - halfLength, 0.0), halfLength, 0.085, 0.006);
}

float spines(vec3 p) {
  float ring = floor(acos(clamp(normalize(p).y, -1.0, 1.0)) / (PI / (RINGS - 1.0)));
  float next = min(ring + 1.0, RINGS - 1.0);
  // The four spines around p: the cells on either side of its azimuth, on the
  // two nearest rings. One cell per ring is not enough once neighbours differ
  // in length, as the march then cuts off the tip of a longer neighbour.
  float d = min(min(spineOnRing(p, ring, 0.0), spineOnRing(p, ring, 1.0)),
                min(spineOnRing(p, next, 0.0), spineOnRing(p, next, 1.0)));
  // Spines further away are not checked, which can overestimate the
  // distance; shorten the step there.
  return 0.8 * d;
}

float spheres(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Two laps per loop, each sphere on its own tilted orbit. Every two bars
    // each one swings in to touch the skull on its beat (beats 1 and 3 of the
    // first bar, beat 1 of the second) and pulls away; beat 3 of the second
    // bar rests.
    float angle = 2.0 * PI * (2.0 * g_beat / LOOP_BEATS + fi / 3.0);
    float tilt = (fi - 1.0) * 0.7;
    float radius = 1.15 - 0.3 * cos(2.0 * PI * (g_beat - 2.0 * fi) / 8.0);
    radius = mix(0.1, radius, g_spheres);
    vec3 center = radius * vec3(cos(angle), sin(angle) * sin(tilt), sin(angle) * cos(tilt));
    d = frapx_opSmoothUnion(d, frapx_sdSphere(p - center, 0.24 * g_spheres), 0.25);
  }
  return d;
}

float frapx_map(vec3 p) {
  vec3 q = p;
  q.xz = frapx_rotate(q.xz, g_spin);
  float body = g_round > 0.0 ? mix(skull(q), frapx_sdSphere(q, BODY_RADIUS), g_round) : skull(q);
  if (g_spines > 0.0) body = frapx_opSmoothUnion(body, spines(q), 0.08);
  if (g_spheres > 0.01) body = frapx_opSmoothUnion(body, spheres(p), 0.32);
  return body;
}

vec3 background(vec2 uv) {
  return vec3(0.03, 0.028, 0.032) * (1.0 - 0.9 * dot(uv, uv));
}

void main() {
  // Wrap in seconds first so the loop's last frame lands exactly on beat 0.
  g_beat = mod(u_time, LOOP) * (BPM / 60.0);
  // One turn per loop, half a turn ahead so the face points at the camera on
  // the drop, when the spines start to grow.
  g_spin = PI - 2.0 * PI * g_beat / LOOP_BEATS;
  // Beats count from 0, four to a bar. Bars 1-4 are calm: the spheres orbit,
  // and in bar 4 they are swallowed. From beat 1 of bar 5 (beat 16, the drop)
  // the spines grow straight out of the skull over a bar, fastest on the beat,
  // and under them the skull rounds into the urchin over bars 5-6, so it never
  // shows as a bare sphere. Bar 8 mirrors the way in: the body turns back into
  // the skull with the spines still out, the spines pull back into it and the
  // spheres come out, back where they started by beat 32.
  g_spheres = 1.0 - smoothstep(12.0, 15.0, g_beat) + smoothstep(30.0, 32.0, g_beat);
  g_round = smoothstep(16.0, 24.0, g_beat) * (1.0 - smoothstep(28.0, 30.0, g_beat));
  float grow = easeOut(clamp((g_beat - 16.0) / SPINE_GROW_BEATS, 0.0, 1.0));
  g_spines = grow * (1.0 - smoothstep(29.5, 31.5, g_beat));

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec3 ro = u_camPos;
  vec3 rd = frapx_cameraRay(gl_FragCoord.xy, u_resolution);
  vec3 color = background(uv);

  // Everything stays inside a sphere of radius 2.2: march only through it.
  float b = dot(ro, rd);
  float h = b * b - (dot(ro, ro) - 2.2 * 2.2);
  if (h > 0.0) {
    h = sqrt(h);
    float t = frapx_raymarch(ro, rd, max(0.0, -b - h), -b + h);
    if (t > 0.0) {
      vec3 p = ro + rd * t;
      // About a voxel apart: closer samples pick up the trilinear facets.
      vec3 n = frapx_normal(p, 0.012);
      vec3 light = normalize(vec3(0.55, 0.7, 0.45));
      float wrap = clamp((dot(n, light) + 0.25) / 1.25, 0.0, 1.0);
      float shadow = frapx_softShadow(p + n * 0.01, light, 0.02, 3.0, 10.0);
      float occlusion = frapx_ao(p, n, 0.3);

      // How thin the surface is behind p: inside a thick part the map is
      // about -h at depth h; near the far side it climbs back toward 0.
      float thin = 0.0;
      for (int i = 1; i <= 4; i++) {
        float depth = 0.07 * float(i);
        thin += clamp((depth + frapx_map(p - n * depth)) / depth, 0.0, 1.0);
      }
      thin *= 0.25;
      float backlit = clamp(0.5 - 0.5 * dot(n, light), 0.0, 1.0);
      float fresnel = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 4.0);

      vec3 bone = vec3(0.86, 0.82, 0.74);
      color = bone * vec3(0.8, 0.85, 1.0) * (0.05 + 0.12 * occlusion);
      color += bone * vec3(1.0, 0.95, 0.88) * 1.15 * wrap * shadow;
      color += vec3(1.0, 0.45, 0.3) * thin * (0.3 + 0.7 * backlit) * occlusion;
      color += vec3(0.55, 0.65, 0.8) * fresnel * occlusion * 0.35;
    }
  }

  fragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}
`;

const stage = document.querySelector<HTMLElement>("[data-stage]")!;
const status = document.querySelector<HTMLElement>("[data-status]")!;

const params = new URLSearchParams(window.location.search);
const stillParam = params.get("still");
const still = stillParam === null ? null : Number(stillParam) || 0;
if (still !== null) document.documentElement.classList.add("is-bare");

const show = (message: string) => {
  status.textContent = message;
  status.hidden = false;
};

// The camera orbits a fixed point; the pointer only nudges it, with inertia.
const target = [0, 0.02, 0] as const;
const base = { yaw: 0.42, pitch: 0.12, radius: 4.6 };
const nudge = { yaw: 0, pitch: 0, toYaw: 0, toPitch: 0 };
let exporting = false;

const cameraPosition = (): [number, number, number] => {
  const yaw = base.yaw + nudge.yaw;
  const pitch = base.pitch + nudge.pitch;
  return [
    target[0] + base.radius * Math.cos(pitch) * Math.sin(yaw),
    target[1] + base.radius * Math.sin(pitch),
    target[2] + base.radius * Math.cos(pitch) * Math.cos(yaw)
  ];
};

const aim = (event: PointerEvent) => {
  if (exporting) return;
  const x = event.clientX / window.innerWidth - 0.5;
  const y = event.clientY / window.innerHeight - 0.5;
  nudge.toYaw = -0.6 * x;
  nudge.toPitch = 0.4 * y;
};
const release = () => {
  nudge.toYaw = 0;
  nudge.toPitch = 0;
};
window.addEventListener("pointermove", aim);
window.addEventListener("pointerdown", aim);
document.documentElement.addEventListener("pointerleave", release);
window.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "mouse") release();
});
window.addEventListener("pointercancel", release);

const start = async () => {
  const volume = await loadSdfVolume(`${import.meta.env.BASE_URL}sdf/Skull.r16f-zstd.sdf.ktx2`, {
    zstd: (bytes, size) => decompress(bytes, new Uint8Array(size))
  });

  const fx: ShaderBackgroundInstance = createShaderBackground({
    target: stage,
    fragment,
    textures: { sdf: volume.texture },
    uniforms: {
      ...volume.uniforms("sdf"),
      camPos: cameraPosition(),
      camTarget: target,
      fov: (40 * Math.PI) / 180
    },
    clock: still === null ? "realtime" : "manual",
    // Raymarching is expensive; cap the resolution on dense screens.
    maxDpr: 1.5,
    onBeforeRender: ({ delta }) => {
      // delta is negative when a manual clock steps back; keep the easing sane.
      const ease = 1 - Math.exp(-3 * Math.min(Math.max(delta, 0), 0.1));
      nudge.yaw += (nudge.toYaw - nudge.yaw) * ease;
      nudge.pitch += (nudge.toPitch - nudge.pitch) * ease;
      fx.setUniform("camPos", cameraPosition());
    },
    onReady: () => {
      status.hidden = true;
      if (still !== null) {
        fx.setTime(still);
        fx.render();
      }
      stage.dataset.ready = "";
    },
    onStatusChange: (next) => {
      if (next === "unsupported") {
        // Show a still from the recorded loop instead of an empty page.
        stage.classList.add("is-poster");
        show("This demo needs WebGL2. Showing a still from the loop.");
      }
    },
    onError: (error) => {
      if (!stage.classList.contains("is-poster")) show(error.message);
    }
  });

  window.__sdfSkull = fx;

  // frapx-render dist --out renders/sdf-skull --encode h264
  registerRenderTarget(fx, {
    fps: 30,
    duration: LOOP_SECONDS,
    resolution: [1280, 720],
    prepare() {
      exporting = true;
      Object.assign(nudge, { yaw: 0, pitch: 0, toYaw: 0, toPitch: 0 });
      fx.setUniform("camPos", cameraPosition());
    }
  });
};

start().catch((error: unknown) => {
  show(error instanceof Error ? error.message : String(error));
});
