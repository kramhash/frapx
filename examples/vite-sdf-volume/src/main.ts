import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import { createParticles } from "@frapx/fx-particles";
import { raymarch, raymarchCamera, raymarchCameraUniforms } from "@frapx/glsl-raymarch";
import { sdf3d, sdfDomain, sdfOps } from "@frapx/glsl-sdf";
import { loadSdfVolume, sdfVolume, type SdfVolume } from "@frapx/glsl-sdf-volume";
import { decompress } from "fzstd";
import "./styles.css";

// Suzanne baked from Blender by the 3dsdf-texture extension (r8, Zstandard).
// frapx_map smooth-unions the baked volume with an analytic sphere from
// glsl-sdf, and glsl-raymarch marches it like any other distance function.
//
// `?still` holds the head still without the sphere, from the camera of
// 3dsdf-texture's three.js viewer, to compare silhouettes.
//
// `?view=particles` shows the same volume driving @frapx/fx-particles: dust
// from the whole viewport is pulled onto the turning head and kept out of it.
// `?view=surface` spawns sparks on the surface that drift off.
const params = new URLSearchParams(window.location.search);
const still = params.has("still");
const view = (["particles", "surface"] as const).find((name) => name === params.get("view")) ?? "raymarch";

const fragment = glsl`#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_blend;
uniform float u_motion;

uniform highp sampler3D u_sdf;
uniform vec3 u_sdfMin;
uniform vec3 u_sdfMax;
uniform float u_sdfScale;
uniform float u_sdfOffset;

out vec4 fragColor;

#define FRAPX_RAYMARCH_STEPS 160

${sdf3d}
${sdfOps}
${sdfDomain}
${sdfVolume}
${raymarchCamera}
${raymarchCameraUniforms}
${raymarch}

float suzanne(vec3 p) {
  p.xz = frapx_rotate(p.xz, 0.35 * sin(u_time * 0.5) * u_motion);
  return frapx_sdVolume(u_sdf, p, u_sdfMin, u_sdfMax, u_sdfScale, u_sdfOffset);
}

float orbiter(vec3 p) {
  float a = u_time * 0.7;
  vec3 c = vec3(1.25 * cos(a), 0.15 + 0.25 * sin(a * 2.0), 1.25 * sin(a));
  return frapx_sdSphere(p - c, 0.32);
}

float frapx_map(vec3 p) {
  float d = suzanne(p);
  if (u_motion > 0.0) d = frapx_opSmoothUnion(d, orbiter(p), max(u_blend, 1e-3));
  return d;
}

void main() {
  vec3 rd = frapx_cameraRay(gl_FragCoord.xy, u_resolution);
  // #1a1a1f, as 3dsdf-texture's viewer, before the gamma below.
  vec3 color = vec3(0.0065, 0.0065, 0.0095);

  float t = frapx_raymarch(u_camPos, rd, 0.0, 20.0);
  if (t > 0.0) {
    vec3 p = u_camPos + rd * t;
    // Sample normals about a voxel apart: closer samples pick up the
    // facets of the trilinear interpolation.
    vec3 n = frapx_normal(p, 0.015);
    vec3 light = normalize(vec3(0.43, 0.5, 0.75));
    float diffuse = max(dot(n, light), 0.0);
    float occlusion = frapx_ao(p, n, 0.25);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 albedo = vec3(0.851, 0.549, 0.349);
    color = albedo * (0.3 * occlusion + 0.8 * diffuse) + 0.25 * rim;
  }

  fragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}
`;

const panel = document.querySelector<HTMLElement>("[data-panel]")!;
const tag = document.querySelector<HTMLElement>("[data-tag]")!;
const blend = document.querySelector<HTMLInputElement>("[data-blend]")!;
const blendOutput = document.querySelector<HTMLOutputElement>("[data-blend-output]")!;

// 3dsdf-texture's viewer: camera at (1.3, 0.6, 3.6) looking at the origin.
const target = [0, 0, 0] as const;
const orbit = still
  ? { yaw: Math.atan2(1.3, 3.6), pitch: Math.asin(0.6 / Math.hypot(1.3, 0.6, 3.6)), radius: Math.hypot(1.3, 0.6, 3.6) }
  : { yaw: 0.35, pitch: 0.15, radius: 4.2 };

const cameraPosition = (): [number, number, number] => [
  target[0] + orbit.radius * Math.cos(orbit.pitch) * Math.sin(orbit.yaw),
  target[1] + orbit.radius * Math.sin(orbit.pitch),
  target[2] + orbit.radius * Math.cos(orbit.pitch) * Math.cos(orbit.yaw)
];

const show = (message: string) => {
  tag.textContent = message;
};

const startRaymarch = (loading: Promise<SdfVolume>) => {
  const background = loading.then((volume) =>
    createShaderBackground({
      target: panel,
      fragment,
      textures: { sdf: volume.texture },
      uniforms: {
        ...volume.uniforms("sdf"),
        camPos: cameraPosition(),
        camTarget: target,
        fov: (45 * Math.PI) / 180,
        blend: Number(blend.value),
        motion: still ? 0 : 1
      },
      // Raymarching is expensive; cap the resolution on dense screens.
      maxDpr: 1.5,
      onReady: () => {
        show(still ? "Still view" : "Drag to orbit");
        panel.dataset.ready = "";
      },
      onError: (error) => show(error.message)
    })
  );

  let drag: { x: number; y: number; id: number } | null = null;

  panel.addEventListener("pointerdown", (event) => {
    drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
    panel.setPointerCapture(event.pointerId);
    panel.classList.add("is-dragging");
  });

  panel.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    orbit.yaw -= (event.clientX - drag.x) * 0.008;
    // Stay clear of straight up/down, where the camera basis is undefined.
    orbit.pitch = Math.min(1.35, Math.max(-1.35, orbit.pitch + (event.clientY - drag.y) * 0.006));
    drag.x = event.clientX;
    drag.y = event.clientY;
    void background.then((fx) => fx.setUniform("camPos", cameraPosition()));
  });

  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    panel.classList.remove("is-dragging");
  };
  panel.addEventListener("pointerup", endDrag);
  panel.addEventListener("pointercancel", endDrag);

  blend.addEventListener("input", () => {
    blendOutput.value = Number(blend.value).toFixed(2);
    void background.then((fx) => fx.setUniform("blend", Number(blend.value)));
  });
};

const startParticles = (loading: Promise<SdfVolume>, mode: "particles" | "surface") => {
  panel.style.cursor = "default";
  void loading.then((volume) => {
    const placement = { volume, size: 0.9, center: [0.5, 0.48, 0.5] as const };
    const particles = createParticles({
      target: panel,
      size: [0.003, 0.007],
      sizeOverLife: "fadeInOut",
      color: [
        [0, "#ffd9b8"],
        [1, "#d98c59"]
      ],
      ...(mode === "particles"
        ? {
            rate: 2500,
            lifetime: [8, 12],
            emitter: { depth: [0, 1] },
            forces: { drag: 3, curl: { strength: 0.02, scale: 3 } },
            sdf: { ...placement, attract: { strength: 24 }, collide: { bounce: 0.2 } }
          }
        : {
            rate: 3000,
            lifetime: [0.8, 1.6],
            sizeOverLife: "fadeOut",
            velocity: { min: [-0.004, 0.004, -0.004], max: [0.004, 0.02, 0.004] },
            forces: { curl: { strength: 0.015, scale: 4 } },
            sdf: { ...placement, emit: "surface" }
          }),
      onReady: () => {
        show(mode === "particles" ? "Dust gathering on Suzanne" : "Sparks from the surface");
        panel.dataset.ready = "";
      },
      onError: (error) => show(error.message)
    });
    // Turn the head; the particles follow through the sdfRotation uniform.
    const turn = (now: number) => {
      particles.setUniform("sdfRotation", [0, 0.6 * Math.sin(now / 2400), 0]);
      requestAnimationFrame(turn);
    };
    requestAnimationFrame(turn);
  });
};

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-view]")) {
  if (link.dataset.view === view) link.setAttribute("aria-current", "page");
}
document.querySelector<HTMLElement>("[data-raymarch-only]")!.hidden = view !== "raymarch";

const loading = loadSdfVolume("/sdf/Suzanne.r8-zstd.sdf.ktx2", {
  zstd: (bytes, size) => decompress(bytes, new Uint8Array(size))
});
loading.catch((error: Error) => show(error.message));
if (view === "raymarch") startRaymarch(loading);
else startParticles(loading, view);
