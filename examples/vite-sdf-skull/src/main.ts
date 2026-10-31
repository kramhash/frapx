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
// distance function: orbiting spheres smooth-union into it, then spines grow
// out of it while it rounds into a sea urchin, then everything returns.
//
// Time alone decides the frame (a 12-second loop), so frapx-render exports it.
// The pointer only nudges the camera. `?still=<seconds>` draws one frame.

/** Length of the loop in seconds; the shader's LOOP must match. */
const LOOP_SECONDS = 12;

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
#define LOOP ${LOOP_SECONDS.toFixed(1)}
// The bake is in metres (the skull is 0.36 long); scale it to about 1.8 units.
#define SKULL_SCALE 5.0
// Rings of latitude the spines sit on, pole to pole.
#define RINGS 9.0
// Radius the skull rounds into.
#define BODY_RADIUS 0.68
// Spines start inside the body so they always grow out of the surface.
#define SPINE_ROOT 0.3

${sdf3d}
${sdfOps}
${sdfDomain}
${sdfVolume}
${raymarchCamera}
${raymarchCameraUniforms}
${raymarch}

// Timeline state, set once per pixel in main() and read by frapx_map.
float g_time;
float g_spin;
float g_spheres;
float g_spines;
float g_round;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// The mesh is not centred in its own space: put the middle of its box at the origin.
float skull(vec3 p) {
  vec3 q = p / SKULL_SCALE + 0.5 * (u_sdfMin + u_sdfMax);
  return SKULL_SCALE * frapx_sdVolume(u_sdf, q, u_sdfMin, u_sdfMax, u_sdfScale, u_sdfOffset);
}

// The spine of one latitude ring nearest to p: a cone from SPINE_ROOT out
// along its direction, its length varied per spine.
float spineOnRing(vec3 p, float ring) {
  float theta = ring * PI / (RINGS - 1.0);
  float count = max(1.0, floor(2.0 * sin(theta) * (RINGS - 1.0) + 0.5));
  float cell = 2.0 * PI / count;
  // Stagger every other ring so neighbours do not line up.
  float offset = mod(ring, 2.0) * 0.5 * cell;
  float index = floor((atan(p.z, p.x) - offset) / cell + 0.5);
  float angle = index * cell + offset;
  vec3 dir = vec3(sin(theta) * cos(angle), cos(theta), sin(theta) * sin(angle));

  float id = ring * 31.0 + mod(index, count);
  float tip = SPINE_ROOT + g_spines * (0.42 + 0.68 * (0.7 + 0.6 * hash11(id)));
  float halfLength = 0.5 * (tip - SPINE_ROOT);
  float h = dot(p, dir);
  float r = length(p - dir * h);
  return frapx_sdCappedCone(vec3(r, h - SPINE_ROOT - halfLength, 0.0), halfLength, 0.085, 0.006);
}

float spines(vec3 p) {
  float ring = floor(acos(clamp(normalize(p).y, -1.0, 1.0)) / (PI / (RINGS - 1.0)));
  float d = min(spineOnRing(p, ring), spineOnRing(p, min(ring + 1.0, RINGS - 1.0)));
  // Only the two nearest rings are checked, which can overestimate the
  // distance between spines; shorten the step there.
  return 0.8 * d;
}

float spheres(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Two laps per loop, each sphere on its own tilted orbit, swinging in
    // and out every three seconds so it touches the skull and pulls away.
    float angle = 2.0 * PI * (2.0 * g_time / LOOP + fi / 3.0);
    float tilt = (fi - 1.0) * 0.7;
    float radius = 1.15 + 0.3 * cos(2.0 * PI * (g_time / 3.0 + fi / 3.0));
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
  g_time = mod(u_time, LOOP);
  g_spin = -2.0 * PI * g_time / LOOP;
  // Spheres orbit, get swallowed at 4 s and come back out from 9.8 s.
  g_spheres = 1.0 - smoothstep(4.0, 5.4, g_time) + smoothstep(9.8, 12.0, g_time);
  g_round = smoothstep(4.4, 6.6, g_time) * (1.0 - smoothstep(8.8, 10.8, g_time));
  g_spines = smoothstep(4.6, 7.0, g_time) * (1.0 - smoothstep(8.6, 10.6, g_time));

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
        // Show the urchin from the recorded loop instead of an empty page.
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
