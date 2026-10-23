import { glsl } from "@frapx/fx-passes";
import { raymarch, raymarchCamera } from "@frapx/glsl-raymarch";
import { sdf3d, sdfOps } from "@frapx/glsl-sdf";
import { BLOOM, BLOOM_LEVELS } from "./bloom.glsl";

/** Seconds in one seamless loop: the song's 8 bars at 128 BPM. */
export const LOOP_SECONDS = 15;

// A quiet tunnel of ribs, lit only by a few glowing rings and the rare vein,
// travelled once per loop: drifting through the song's calm, and in its drop
// thrown forward by every kick while the cross-section turns from circle to
// hexagon to star. Every sample is one ray in linear light;
// @frapx/fx-passes sums the samples of a frame in float and hands their mean
// on to the bloom and display passes. u_time moves within the shutter and
// u_jitter within the pixel, so the mean is motion blurred and anti-aliased
// without anything else here knowing about samples.
export const scene = glsl`#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_jitter;
uniform vec2 u_pointerUv;
uniform float u_pointerActive;
uniform float u_reducedMotion;
// 1: ambient occlusion and more march steps; 0: lighter.
uniform float u_quality;
// The song (see rhythm.ts): the kick's flash and afterglow and the hats, each
// decaying since it fired, the bar's loudness, and the drop, all 0–1.
uniform float u_flash;
uniform float u_pulse;
uniform float u_hat;
uniform float u_energy;
uniform float u_drop;
// How far the camera has come through the loop (0–1), the cross-section
// (0 circle, 1 hexagon, 2 star, 3 the circle again) and a kick's roll.
uniform float u_travel;
uniform float u_shape;
uniform float u_kickRoll;

#define FRAPX_RAYMARCH_STEPS 144
#define FRAPX_AO_SAMPLES 4

${sdf3d}
${sdfOps}
${raymarchCamera}
${raymarch}

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float FOV = PI * 0.34;
const float LOOP_SECONDS = ${LOOP_SECONDS.toFixed(1)};
const float LOOP_DISTANCE = 24.0;
// Everything that varies along z repeats every LOOP_DISTANCE, so when the
// camera wraps from the end of the loop back to its start, the tunnel ahead
// is the same. Frequencies along z are whole multiples of this.
const float Z_FREQUENCY = TAU / LOOP_DISTANCE;
const float CELL_SIZE = 4.0;
const float CELLS_PER_LOOP = LOOP_DISTANCE / CELL_SIZE;
// Only every other rib carries a glowing ring: they sit at multiples of this.
const float RING_SPACING = 2.0 * CELL_SIZE;
// Rings and ribs are cut away below these heights, leaving the floor dark.
const float RING_FLOOR = -0.96;
// How far aside the bend carries the tunnel.
const float BEND_OFFSET = 2.4;
const float MAX_DISTANCE = 42.0;

const vec3 RING_COLOR = vec3(0.3, 0.88, 1.0);
const vec3 VEIN_COLOR = vec3(0.78, 0.14, 1.1);

struct SceneSample {
  float dist;
  float material;
  vec2 glowDistance;
};

struct MarchResult {
  float dist;
  vec2 glow;
};

float hash11(float p) {
  return fract(sin(p * 127.1 + 311.7) * 43758.5453123);
}

// 0 outside [a, d], 1 within [b, c], eased in between.
float band(float x, float a, float b, float c, float d) {
  return smoothstep(a, b, x) * (1.0 - smoothstep(c, d, x));
}

// Quintic smoothstep: its curvature is continuous too, so the camera turns
// into a bend without a jolt.
float smootherstep(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * t * (t * (6.0 * t - 15.0) + 10.0);
}

vec2 tunnelPath(float z) {
  float a = Z_FREQUENCY * z;
  // Once per loop the tunnel bends sharply aside, hiding what lies ahead, and
  // eases back before the loop ends. The steepest slope stays below 0.7, which
  // the shortened march steps still cover.
  float cycle = fract(z / LOOP_DISTANCE);
  float bend = BEND_OFFSET * (smootherstep(0.26, 0.54, cycle) - smootherstep(0.68, 0.98, cycle));
  return vec2(
    0.34 * sin(a) + 0.1 * sin(a * 3.0 + 0.4) + bend,
    0.2 * sin(a * 2.0 + 0.65)
  );
}

float breathAt(float z) {
  return sin(TAU * fract(u_time / LOOP_SECONDS) + z * Z_FREQUENCY);
}

// The cell's index within the loop, 0 to CELLS_PER_LOOP - 1.
float repeatCellAt(float z) {
  float cell = floor((z + 0.5 * CELL_SIZE) / CELL_SIZE);
  return mod(cell, CELLS_PER_LOOP);
}

float ribRadiusAt(float repeatCell, float breath) {
  float variation = hash11(repeatCell + 1.0);
  return 2.05 + 0.1 * (variation - 0.5) + 0.04 * breath;
}

// The cross-section's radius at polar angle a, relative to the circle's: the
// circle, a hexagon and a six-pointed star, each with an edge (or the hollow
// between two points) along the floor, blended as u_shape turns.
float sectionScale(float a) {
  const float SEGMENT = PI / 6.0;
  float local = mod(a + 0.5 * PI + SEGMENT, 2.0 * SEGMENT) - SEGMENT;
  float hexagon = 0.93 / cos(local);
  float star = 0.8 + 0.42 * pow(abs(local) / SEGMENT, 2.0);
  float shape = floor(u_shape);
  float blend = fract(u_shape);
  if (shape < 0.5) return mix(1.0, hexagon, blend);
  if (shape < 1.5) return mix(hexagon, star, blend);
  return mix(star, 1.0, blend);
}

// 0 while the cross-section is a circle, 1 once it is wholly another shape.
float sectionWarp() {
  float shape = floor(u_shape);
  float blend = fract(u_shape);
  return shape < 0.5 ? blend : shape < 1.5 ? 1.0 : 1.0 - blend;
}

SceneSample sampleScene(vec3 p) {
  float cycle = fract(p.z / LOOP_DISTANCE);
  float glowRise = band(cycle, 0.1, 0.25, 0.46, 0.62);
  float breath = breathAt(p.z);

  vec3 q = p;
  q.xy -= tunnelPath(p.z);
  float twist = 0.08 * sin(TAU * cycle);
  q.xy = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * q.xy;

  float polar = atan(q.y, q.x);
  float membrane = 0.13 * sin(polar * 5.0 + p.z * 2.0 * Z_FREQUENCY)
    + 0.07 * sin(polar * 9.0 - p.z * Z_FREQUENCY);
  float tunnelRadius = 2.34 + membrane + 0.06 * breath;
  // Walls and ribs are drawn around the circle, in a cross-section stretched
  // by sectionScale() along every angle.
  float scale = sectionScale(polar);
  vec2 section = q.xy / scale;
  float wall = tunnelRadius - length(section);

  float repeatCell = repeatCellAt(p.z);
  float cellZ = mod(p.z + 0.5 * CELL_SIZE, CELL_SIZE) - 0.5 * CELL_SIZE;
  float variation = hash11(repeatCell + 1.0);
  float ribRadius = ribRadiusAt(repeatCell, breath);
  float ribThickness = mix(0.1, 0.17, variation);

  vec3 ringPoint = vec3(section.x, cellZ, section.y);
  float rib = frapx_sdTorus(ringPoint, vec2(ribRadius, ribThickness));
  rib = max(rib, -(q.y + 1.18 + 0.12 * sin(repeatCell)));

  vec3 nodePoint = q - vec3(
    mix(-1.72, 1.72, step(0.5, variation)),
    0.3 + 0.75 * (variation - 0.5),
    0.42 * sin(repeatCell * 2.1)
  );
  float node = frapx_sdSphere(nodePoint, 0.24 + 0.08 * glowRise);
  float structure = frapx_opSmoothUnion(wall, rib, 0.12);
  structure = frapx_opSmoothUnion(structure, node, 0.16);

  // Glowing rings on the even cells only, which sit at multiples of RING_SPACING.
  float cyanVein = 1e3;
  if (mod(repeatCell, 2.0) < 0.5) {
    cyanVein = frapx_sdTorus(ringPoint, vec2(ribRadius - 0.18, 0.04 + 0.012 * glowRise));
    cyanVein = max(cyanVein, -(q.y - RING_FLOOR));
  }

  // A vein along the wall in two cells of the loop, tapering to points well
  // inside its cell so it never ends in a cut at the cell's edge.
  float purpleVein = 1e3;
  if (abs(mod(repeatCell, 3.0) - 1.0) < 0.5) {
    float veinAngle = TAU * (0.12 + 0.68 * variation);
    vec3 longitudinalPoint = vec3(
      section.x - (tunnelRadius - 0.18) * cos(veinAngle),
      section.y - (tunnelRadius - 0.18) * sin(veinAngle),
      cellZ
    );
    float taper = 1.0 - smoothstep(0.7, 1.6, abs(cellZ));
    purpleVein = frapx_sdCapsule(
      longitudinalPoint,
      vec3(0.0, 0.0, -1.6),
      vec3(0.0, 0.0, 1.6),
      (0.034 + 0.01 * glowRise) * taper
    );
  }

  float nearest = structure;
  float material = 0.0;
  if (cyanVein < nearest) {
    nearest = cyanVein;
    material = 1.0;
  }
  if (purpleVein < nearest) {
    nearest = purpleVein;
    material = 2.0;
  }

  // The breathing membrane, smooth unions and the stretched cross-section are
  // conservative rather than exact distances, so shorten every tracing step
  // to avoid overshooting; the star's points shorten it the most.
  float stride = 0.62 * mix(1.0, 0.7, sectionWarp());
  return SceneSample(nearest * stride, material, vec2(cyanVein, purpleVein));
}

float frapx_map(vec3 p) {
  return sampleScene(p).dist;
}

// Marches by hand instead of frapx_raymarch(): the veins' glow is integrated
// from the distance to them at every step along the ray, which a march that
// only returns the hit cannot give.
MarchResult marchArtwork(vec3 ro, vec3 rd) {
  float t = 0.02;
  vec2 glow = vec2(0.0);
  int stepLimit = u_quality > 0.5 ? 144 : 92;

  for (int i = 0; i < 144; i++) {
    if (i >= stepLimit) break;

    SceneSample scene = sampleScene(ro + rd * t);
    float stride = max(abs(scene.dist), 0.012);
    vec2 proximity = exp(-10.5 * abs(scene.glowDistance));
    glow += proximity * min(stride, 0.24) * 0.09 / (1.0 + 0.012 * t * t);

    if (scene.dist < 0.00055 * max(t, 1.0)) {
      return MarchResult(t, glow);
    }

    t += max(scene.dist, 0.012);
    if (t > MAX_DISTANCE) break;
  }

  return MarchResult(-1.0, glow);
}

// Diffuse (x) and specular (y) light on a surface from the glowing ring at
// ringZ, treated as a circle of light shining from its point nearest p.
vec2 ringLight(vec3 p, vec3 n, vec3 toEye, float ringZ) {
  float radius = ribRadiusAt(repeatCellAt(ringZ), breathAt(ringZ)) - 0.18;
  vec3 centre = vec3(tunnelPath(ringZ), ringZ);
  vec2 radial = p.xy - centre.xy;
  float angle = atan(radial.y, radial.x);
  // Below the floor line the ring is cut away; there it shines from its ends.
  float lowest = RING_FLOOR / radius;
  if (sin(angle) < lowest) {
    angle = cos(angle) > 0.0 ? asin(lowest) : PI - asin(lowest);
  }
  float reach = radius * sectionScale(angle);
  vec3 source = centre + vec3(reach * cos(angle), reach * sin(angle), 0.0);
  vec3 toLight = source - p;
  float distanceSquared = max(dot(toLight, toLight), 1e-4);
  vec3 l = toLight * inversesqrt(distanceSquared);
  float falloff = 1.0 / (1.0 + 1.6 * distanceSquared);
  float diffuse = max(dot(n, l), 0.0) * falloff;
  float specular = pow(max(dot(n, normalize(l + toEye)), 0.0), 56.0) * falloff;
  return vec2(diffuse, specular);
}

void main() {
  // Reduced motion holds the straight stretch after the bend, rings in a row.
  float travel = u_reducedMotion > 0.5 ? 0.875 : fract(u_travel);
  float cameraZ = travel * LOOP_DISTANCE;
  vec2 pointer = (u_pointerUv - 0.5) * u_pointerActive;

  vec3 eye = vec3(tunnelPath(cameraZ), cameraZ);
  float lookAhead = 2.8;
  vec3 target = vec3(
    tunnelPath(cameraZ + lookAhead) + pointer * vec2(0.3, 0.22),
    cameraZ + lookAhead
  );
  float roll = 0.035 * sin(TAU * travel * 2.0) + u_kickRoll + pointer.x * 0.018;
  mat3 camera = frapx_lookAt(eye, target, roll);
  vec3 rd = frapx_cameraRay(gl_FragCoord.xy + u_jitter, u_resolution, camera, FOV);

  // The far end of the tunnel fades into this.
  vec3 voidColor = vec3(0.0012, 0.0018, 0.0032);
  vec3 color = voidColor;

  // The calm glows low and only breathes with the kick; the drop is brighter
  // and flares on every kick, at the beat itself, then afterglows.
  // Between kicks the drop sinks below the calm, so each kick stands out.
  float beat = mix(0.35, 1.6, u_drop) * u_pulse + 4.0 * u_drop * u_flash;
  float ringPower = mix(3.2, 1.9, u_drop) * (1.0 + 0.2 * u_energy) * (1.0 + beat + 0.15 * u_hat);
  float veinPower = mix(2.2, 1.4, u_drop) * (1.0 + 0.2 * u_energy) * (1.0 + 2.0 * beat + 0.6 * u_hat);

  MarchResult hit = marchArtwork(eye, rd);

  if (hit.dist > 0.0) {
    vec3 p = eye + rd * hit.dist;
    vec3 n = frapx_normal(p, max(0.0007, 0.00038 * hit.dist));
    SceneSample surface = sampleScene(p);
    vec3 toEye = -rd;

    float occlusion = u_quality > 0.5 ? frapx_ao(p, n, 0.28) : 0.85;
    float ringZ = floor(p.z / RING_SPACING) * RING_SPACING;
    vec2 ring = ringLight(p, n, toEye, ringZ) + ringLight(p, n, toEye, ringZ + RING_SPACING);
    // Wet surfaces: dull face on, mirror-like at grazing angles.
    float fresnel = 0.08 + 0.92 * pow(1.0 - max(dot(n, toEye), 0.0), 5.0);
    float veinNear = exp(-5.0 * max(surface.glowDistance.y, 0.0));

    vec3 albedo = vec3(0.03, 0.036, 0.042);
    vec3 light = RING_COLOR * ringPower * ring.x
      + VEIN_COLOR * veinPower * 0.35 * veinNear
      + vec3(0.012, 0.016, 0.02);
    vec3 shaded = albedo * light * occlusion
      + RING_COLOR * ringPower * ring.y * fresnel * 0.6;

    if (surface.material > 1.5) {
      shaded = VEIN_COLOR * veinPower;
    } else if (surface.material > 0.5) {
      shaded = RING_COLOR * ringPower * 0.9;
    }

    float fog = 1.0 - exp(-0.0055 * hit.dist * hit.dist);
    color = mix(shaded, voidColor, fog);
  }

  color += RING_COLOR * hit.glow.x * ringPower * 0.6
    + VEIN_COLOR * hit.glow.y * veinPower * 0.6;
  fragColor = vec4(color, 1.0);
}
`;

// Bloom, vignette, tone curve and dither, once per frame on the mean of the
// samples.
export const display = glsl`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_${BLOOM};
uniform float u_frameTime;
// 1 adds dither against banding in 8-bit output; 16-bit output needs none.
uniform float u_dither;

const float LOOP_SECONDS = ${LOOP_SECONDS.toFixed(1)};
const float BLOOM_STRENGTH = 0.5;

float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

// Narkowicz's fit of the ACES filmic curve: deep blacks, and bright light
// rolls off to white instead of flattening out.
vec3 aces(vec3 x) {
  return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 color = texelFetch(u_scene, ivec2(gl_FragCoord.xy), 0).rgb;
  color += texture(u_${BLOOM}, v_uv).rgb * (BLOOM_STRENGTH / ${BLOOM_LEVELS.toFixed(1)});
  color *= 1.0 - 0.42 * smoothstep(0.18, 0.82, length(v_uv - 0.5));
  color = aces(color);
  // Seeded by the frame within the loop, so the last frame wraps to the first.
  float phase = fract(u_frameTime / LOOP_SECONDS);
  color += u_dither * (hash31(vec3(gl_FragCoord.xy, phase * 97.0)) - 0.5) / 255.0;
  fragColor = vec4(pow(max(color, 0.0), vec3(0.4545)), 1.0);
}
`;
