// Starter shaders. Uniforms with a trailing `// @range … @default …` comment
// get sliders (#92); built-in uniforms (u_time, u_resolution, u_pointer*) do not.

export type Starter = { readonly id: string; readonly label: string; readonly source: string };

const waves = `precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointerUv;
uniform float u_pointerActive;
uniform float u_time;
uniform float u_speed; // @range 0 4 @default 1.5 @step 0.01
uniform float u_frequency; // @range 1 40 @default 12 @step 0.1
uniform vec3 u_tint; // @color @default #26738c

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float wave = sin(uv.x * u_frequency + u_time * u_speed) * 0.5 + 0.5;
  float pointer = smoothstep(0.35, 0.0, distance(uv, u_pointerUv)) * u_pointerActive;
  vec3 base = mix(vec3(0.03, 0.05, 0.08), vec3(0.1, 0.35, 0.5), uv.y);
  vec3 color = base + u_tint * wave + vec3(0.7, 0.9, 1.0) * pointer;
  gl_FragColor = vec4(color, 1.0);
}
`;

const noise = `precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_scale; // @range 0.5 8 @default 2.5 @step 0.01
uniform float u_speed; // @range 0 1 @default 0.12 @step 0.01
uniform vec3 u_colorA; // @color @default #0b1026
uniform vec3 u_colorB; // @color @default #f2a65a

// Pulls in frapx_fbm3d from @frapx/glsl-noise.
// @include fbm3d

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * u_scale;
  float t = u_time * u_speed;
  // Domain warping: feed one fBm field into another.
  float warp = frapx_fbm3d(vec3(p, t));
  float n = frapx_fbm3d(vec3(p + warp, t + 10.0));
  vec3 color = mix(u_colorA, u_colorB, smoothstep(-0.6, 0.6, n));
  gl_FragColor = vec4(color, 1.0);
}
`;

const sdf = `precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointerUv;
uniform float u_pointerActive;
uniform float u_time;
uniform float u_blend; // @range 0 0.5 @default 0.18 @step 0.01
uniform float u_bands; // @range 0 300 @default 140 @step 1

// Shapes, boolean ops and domain helpers from @frapx/glsl-sdf.
// @include sdf2d
// @include sdfOps
// @include sdfDomain

const float SCALE = 2.0;

vec2 toScene(vec2 uv) {
  return (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * SCALE;
}

float scene(vec2 p) {
  vec2 boxP = frapx_rotate(p - vec2(-0.42, -0.05), u_time * 0.4);
  float box = frapx_sdRoundBox(boxP, vec2(0.24), vec4(0.12, 0.02, 0.02, 0.12));
  float hexagon = frapx_sdHexagon(frapx_rotate(p - vec2(0.42, 0.0), -u_time * 0.3), 0.2);
  float triangle = frapx_sdEquilateralTriangle(p - vec2(0.0, 0.3 + 0.08 * sin(u_time)), 0.18);

  float d = frapx_opSmoothUnion(box, hexagon, u_blend);
  d = frapx_opSmoothUnion(d, triangle, u_blend);

  float cursor = frapx_sdCircle(p - toScene(u_pointerUv), 0.1);
  return mix(d, frapx_opSmoothUnion(d, cursor, u_blend), u_pointerActive);
}

void main() {
  vec2 p = toScene(gl_FragCoord.xy / u_resolution);
  float d = scene(p);

  vec3 color = d > 0.0 ? vec3(0.95, 0.62, 0.32) : vec3(0.55, 0.82, 1.0);
  color *= 1.0 - exp(-5.0 * abs(d));
  color *= 0.82 + 0.18 * cos(u_bands * d);
  float edge = SCALE / u_resolution.y * 1.5;
  color = mix(color, vec3(1.0), 1.0 - smoothstep(0.0, edge, abs(d)));
  gl_FragColor = vec4(color, 1.0);
}
`;

const raymarch = `precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_orbit; // @range 0 1 @default 0.2 @step 0.01
uniform float u_shadowK; // @range 1 32 @default 12 @step 0.5
uniform vec3 u_albedo; // @color @default #e68c4d

// @include sdf3d
// @include sdfOps
// @include sdfDomain
// @include raymarchCamera
// @include raymarch

float objects(vec3 p) {
  vec3 center = p - vec3(0.0, 0.12 * sin(u_time * 0.8), 0.0);
  float sphere = frapx_sdSphere(center - vec3(0.0, 0.25, 0.0), 0.7);
  vec3 slabP = center - vec3(0.0, -0.35, 0.0);
  slabP.xz = frapx_rotate(slabP.xz, u_time * 0.25);
  float slab = frapx_sdRoundBox(slabP, vec3(0.85, 0.22, 0.85), 0.08);
  float body = frapx_opSmoothUnion(sphere, slab, 0.25);

  vec3 ringP = p - vec3(0.0, 0.25, 0.0);
  ringP.xy = frapx_rotate(ringP.xy, 0.45);
  ringP.xz = frapx_rotate(ringP.xz, u_time * 0.4);
  float ring = frapx_sdTorus(ringP, vec2(1.35, 0.06));
  return min(body, ring);
}

float floorPlane(vec3 p) {
  return p.y + 1.0;
}

// glsl-raymarch marches whatever frapx_map returns.
float frapx_map(vec3 p) {
  return min(objects(p), floorPlane(p));
}

void main() {
  float angle = 0.6 + u_time * u_orbit;
  vec3 eye = vec3(6.0 * sin(angle), 2.4, 6.0 * cos(angle));
  vec3 rd = frapx_cameraRay(gl_FragCoord.xy, u_resolution, eye, vec3(0.0), radians(40.0));
  vec3 sky = mix(vec3(0.03, 0.04, 0.07), vec3(0.18, 0.22, 0.3), clamp(rd.y * 0.8 + 0.4, 0.0, 1.0));
  vec3 color = sky;

  float t = frapx_raymarch(eye, rd, 0.0, 40.0);
  if (t > 0.0) {
    vec3 p = eye + rd * t;
    vec3 n = frapx_normal(p, 0.0005 * t);
    vec3 light = normalize(vec3(0.55, 0.8, 0.35));
    float shadow = frapx_softShadow(p + n * 0.01, light, 0.01, 12.0, u_shadowK);
    float occlusion = frapx_ao(p, n, 0.35);
    float diffuse = max(dot(n, light), 0.0) * shadow;
    float specular = pow(max(dot(reflect(-light, n), -rd), 0.0), 32.0) * shadow;

    float checker = mod(floor(p.x * 1.5) + floor(p.z * 1.5), 2.0);
    bool onFloor = floorPlane(p) < objects(p);
    vec3 albedo = onFloor ? vec3(0.32) * (0.8 + 0.2 * checker) : u_albedo;
    color = albedo * (0.25 * occlusion * (0.6 + 0.4 * n.y) + 1.1 * diffuse) + 0.4 * specular;
    color = mix(color, sky, 1.0 - exp(-0.004 * t * t));
  }

  gl_FragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}
`;

export const starters: readonly Starter[] = [
  { id: "waves", label: "Waves", source: waves },
  { id: "noise", label: "Noise", source: noise },
  { id: "sdf", label: "SDF", source: sdf },
  { id: "raymarch", label: "Raymarch", source: raymarch }
];

export const defaultStarter = starters[0]!;
