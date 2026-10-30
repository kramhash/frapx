import {
  presets,
  type BlendMode,
  type ColorStop,
  type ParticleConfig,
  type ParticleUniformName,
  type UniformInput
} from "@frapx/fx-particles";
import type { UseParticlesOptions } from "../useParticles";

/** Option values an existing instance can take in place. */
export type LiveValues = {
  uniforms: Partial<Record<ParticleUniformName, UniformInput>>;
  color?: string | readonly ColorStop[];
  palette?: readonly string[];
  blend?: BlendMode;
};

// Top-level options backed by a uniform of the same name.
const TOP_UNIFORMS = ["rate", "opacity", "twinkle", "perspective"] as const;

// Options left out of the structure: live values, the forces (handled
// separately), the in-place clock, time source and resolution, and the hook's
// own options.
const NOT_STRUCTURE = new Set<string>([
  ...TOP_UNIFORMS,
  "color",
  "palette",
  "blend",
  "forces",
  "sdf",
  "clock",
  "timeSource",
  "resolution",
  "onParticlesReady",
  "onParticlesError",
  "onStatusChange",
  "uniformSources"
]);

export const liveValuesOf = (options: UseParticlesOptions): LiveValues => {
  const uniforms: Partial<Record<ParticleUniformName, UniformInput>> = {};
  for (const name of TOP_UNIFORMS) {
    const value = options[name];
    if (value !== undefined) uniforms[name] = value;
  }
  const { gravity, drag, curl, pointer } = options.forces ?? {};
  if (gravity !== undefined) uniforms.gravity = gravity;
  if (drag !== undefined) uniforms.drag = drag;
  if (curl?.strength !== undefined) uniforms.curlStrength = curl.strength;
  if (curl?.scale !== undefined) uniforms.curlScale = curl.scale;
  if (curl?.speed !== undefined) uniforms.curlSpeed = curl.speed;
  if (pointer?.strength !== undefined) uniforms.pointerStrength = pointer.strength;
  if (pointer?.radius !== undefined) uniforms.pointerRadius = pointer.radius;
  const sdf = options.sdf;
  if (sdf?.center !== undefined) uniforms.sdfCenter = sdf.center;
  if (sdf?.size !== undefined) uniforms.sdfSize = sdf.size;
  if (sdf?.rotation !== undefined) uniforms.sdfRotation = sdf.rotation;
  if (sdf?.attract?.strength !== undefined) uniforms.sdfAttractStrength = sdf.attract.strength;
  if (sdf?.attract?.falloff !== undefined) uniforms.sdfAttractFalloff = sdf.attract.falloff;
  if (sdf?.collide?.bounce !== undefined) uniforms.sdfBounce = sdf.collide.bounce;

  const live: LiveValues = { uniforms };
  if (options.color !== undefined) live.color = options.color;
  if (options.palette !== undefined) live.palette = options.palette;
  if (options.blend !== undefined) live.blend = options.blend;
  return live;
};

/**
 * Everything a change to which recreates the instance. Which forces are
 * present is structure; their values are live uniforms. For `sdf`, the volume
 * (by identity), which of attract / collide are present and `emit` are
 * structure; the placement and strengths are live.
 */
export const structureOf = (options: UseParticlesOptions): Record<string, unknown> => {
  const structure: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!NOT_STRUCTURE.has(key) && value !== undefined) structure[key] = value;
  }
  if (options.forces) {
    structure.forces = Object.keys(options.forces).filter(
      (name) => options.forces?.[name as keyof typeof options.forces] !== undefined
    );
  }
  if (options.sdf) {
    structure.sdf = {
      // deepEqual compares the volume's typed array and uniforms() by
      // identity, so another loaded volume recreates and the same one does not.
      volume: options.sdf.volume,
      attract: options.sdf.attract !== undefined,
      collide: options.sdf.collide !== undefined,
      emit: options.sdf.emit ?? null
    };
  }
  return structure;
};

/**
 * True when `next` drops a value `previous` set. The instance cannot fall back
 * to the preset or default on its own, so it is recreated.
 */
export const dropsValue = (previous: LiveValues, next: LiveValues): boolean =>
  Object.keys(previous.uniforms).some(
    (name) => next.uniforms[name as ParticleUniformName] === undefined
  ) ||
  (previous.color !== undefined && next.color === undefined) ||
  (previous.palette !== undefined && next.palette === undefined) ||
  (previous.blend !== undefined && next.blend === undefined);

// fx-particles' default lifetime is [2, 4].
const DEFAULT_LONGEST_LIFETIME = 4;

const presetConfig = (preset: UseParticlesOptions["preset"]): ParticleConfig | undefined =>
  typeof preset === "string" ? presets[preset] : preset;

/**
 * True when `rate` would spawn more particles than the automatically sized
 * pool holds, so the instance must be recreated with a larger one. A
 * `maxParticles` the caller chose is kept.
 */
export const outgrowsPool = (
  options: UseParticlesOptions,
  rate: UniformInput | undefined,
  pool: number
): boolean => {
  if (options.maxParticles !== undefined || typeof rate !== "number") return false;
  const longest =
    (options.lifetime ?? presetConfig(options.preset)?.lifetime)?.[1] ?? DEFAULT_LONGEST_LIFETIME;
  return rate * longest > pool;
};
