import { hexToRgba, normalizeUniform } from "@frapx/core";
import type { NormalizedUniform, TextureInput, UniformInput } from "@frapx/core";
import { presets } from "../presets";
import { LUT_WIDTH, parseColorStops } from "./lut";
import type {
  BlendMode,
  ColorStop,
  CreateParticlesOptions,
  ParticleConfig,
  ParticleUniformName,
  Range,
  SdfVolume,
  SizeOverLife,
  SpriteShape,
  Vec3
} from "../types";

/** Above this the pool is almost certainly a mistake (and GPU memory heavy). */
export const MAX_POOL = 1 << 20;
const MIN_POOL = 16;
const POOL_HEADROOM = 1.25;

const SPRITE_SHAPES: readonly SpriteShape[] = ["soft", "disc", "ring", "square", "glint"];
const SIZE_CURVES: readonly SizeOverLife[] = ["constant", "fadeIn", "fadeOut", "fadeInOut"];

/** Uniforms read by the simulation; the rest only affect drawing. */
export const SIMULATION_UNIFORMS: ReadonlySet<ParticleUniformName> = new Set([
  "rate",
  "gravity",
  "drag",
  "curlStrength",
  "curlScale",
  "curlSpeed",
  "pointerStrength",
  "pointerRadius",
  // Spawns are placed on screen, so depth scaling moves them in the world.
  "perspective",
  "sdfCenter",
  "sdfSize",
  "sdfRotation",
  "sdfAttractStrength",
  "sdfAttractFalloff",
  "sdfBounce"
]);

export type ResolvedForces = {
  gravity: boolean;
  drag: boolean;
  curl: boolean;
  pointer: boolean;
};

export type ResolvedSdf = {
  volume: SdfVolume;
  attract: boolean;
  collide: boolean;
  emit: "surface" | "inside" | null;
};

export type ResolvedConfig = {
  lifetime: Range;
  area: readonly [number, number, number, number];
  depth: Range;
  velocityMin: Vec3;
  velocityMax: Vec3;
  forces: ResolvedForces;
  size: Range;
  sizeOverLife: SizeOverLife;
  color: string | readonly ColorStop[];
  palette: readonly string[] | null;
  sprite: SpriteShape | { texture: TextureInput };
  spin: Range;
  tumble: boolean;
  blend: BlendMode;
  sdf: ResolvedSdf | null;
  /** Initial values of the uniforms that exist, by name without `u_`. */
  uniforms: Map<ParticleUniformName, NormalizedUniform>;
  pool: number;
  simulationRate: number;
  prewarmSteps: number;
  seed: number;
};

/** Merges `config` over `base`; `forces`, `emitter` and `velocity` field by field. */
export const mergeConfig = (base: ParticleConfig, config: ParticleConfig): ParticleConfig => {
  const merged: ParticleConfig = { ...base, ...config };
  if (base.emitter || config.emitter) merged.emitter = { ...base.emitter, ...config.emitter };
  if (base.velocity || config.velocity) merged.velocity = { ...base.velocity, ...config.velocity };
  if (base.forces || config.forces) {
    const forces = { ...base.forces, ...config.forces };
    if (base.forces?.curl && config.forces?.curl) {
      forces.curl = { ...base.forces.curl, ...config.forces.curl };
    }
    if (base.forces?.pointer && config.forces?.pointer) {
      forces.pointer = { ...base.forces.pointer, ...config.forces.pointer };
    }
    merged.forces = forces;
  }
  return merged;
};

const pickConfig = (options: CreateParticlesOptions): ParticleConfig => {
  const keys: ReadonlyArray<keyof ParticleConfig> = [
    "rate",
    "lifetime",
    "emitter",
    "velocity",
    "forces",
    "size",
    "sizeOverLife",
    "color",
    "palette",
    "opacity",
    "sprite",
    "spin",
    "tumble",
    "twinkle",
    "blend",
    "perspective",
    "sdf"
  ];
  const config: Record<string, unknown> = {};
  for (const key of keys) {
    if (options[key] !== undefined) config[key] = options[key];
  }
  return config as ParticleConfig;
};

const resolvePreset = (preset: CreateParticlesOptions["preset"]): ParticleConfig => {
  if (preset === undefined) return {};
  if (typeof preset === "string") {
    const found = (presets as Record<string, ParticleConfig | undefined>)[preset];
    if (!found) throw new RangeError(`Unknown particle preset: ${preset}`);
    return found;
  }
  return preset;
};

const finite = (name: string, value: number, min = Number.NEGATIVE_INFINITY): number => {
  if (!Number.isFinite(value) || value < min) {
    throw new RangeError(`${name} must be a finite number${min > Number.NEGATIVE_INFINITY ? ` >= ${min}` : ""}, got ${value}`);
  }
  return value;
};

const range = (name: string, value: Range, min = Number.NEGATIVE_INFINITY): Range => {
  const [a, b] = value;
  finite(`${name}[0]`, a, min);
  finite(`${name}[1]`, b, min);
  if (b < a) throw new RangeError(`${name} must be [min, max], got [${a}, ${b}]`);
  return [a, b];
};

const vec3 = (name: string, value: Vec3): Vec3 => {
  value.forEach((component, index) => finite(`${name}[${index}]`, component));
  return [value[0], value[1], value[2]];
};

const isSpriteShape = (sprite: unknown): sprite is SpriteShape =>
  typeof sprite === "string" && (SPRITE_SHAPES as readonly string[]).includes(sprite);

export const resolveConfig = (options: CreateParticlesOptions): ResolvedConfig => {
  const config = mergeConfig(resolvePreset(options.preset), pickConfig(options));

  const rate = finite("rate", config.rate ?? 20, 0);
  const lifetime = range("lifetime", config.lifetime ?? [2, 4]);
  if (lifetime[0] <= 0) throw new RangeError(`lifetime must be positive, got ${lifetime[0]}`);
  const area = config.emitter?.area ?? [0, 0, 1, 1];
  area.forEach((value, index) => finite(`emitter.area[${index}]`, value));
  const depth = range("emitter.depth", config.emitter?.depth ?? [0, 0], 0);
  const velocityMin = vec3("velocity.min", config.velocity?.min ?? [0, 0, 0]);
  const velocityMax = vec3("velocity.max", config.velocity?.max ?? velocityMin);
  const size = range("size", config.size ?? [0.01, 0.02], 0);
  const sizeOverLife = config.sizeOverLife ?? "constant";
  if (!SIZE_CURVES.includes(sizeOverLife)) {
    throw new RangeError(`Unknown sizeOverLife: ${String(sizeOverLife)}`);
  }
  const spin = range("spin", config.spin ?? [0, 0]);
  const blend = config.blend ?? "additive";
  if (blend !== "additive" && blend !== "normal") {
    throw new RangeError(`Unknown blend: ${String(blend)}`);
  }
  const color = config.color ?? "#ffffff";
  parseColorStops(color);
  const palette = config.palette && config.palette.length > 0 ? config.palette : null;
  palette?.forEach((entry) => hexToRgba(entry));
  if (palette && palette.length > LUT_WIDTH) {
    throw new RangeError(`palette holds at most ${LUT_WIDTH} colors`);
  }
  const spriteInput = config.sprite ?? "soft";
  if (typeof spriteInput === "string" && !isSpriteShape(spriteInput) && /^[a-z]+$/.test(spriteInput)) {
    // A bare word is a mistyped shape, not an image URL.
    throw new RangeError(`Unknown sprite: ${spriteInput}`);
  }
  const sprite = isSpriteShape(spriteInput) ? spriteInput : { texture: spriteInput };

  const forces = config.forces ?? {};
  const uniforms = new Map<ParticleUniformName, NormalizedUniform>();
  const set = (name: ParticleUniformName, value: UniformInput) => {
    uniforms.set(name, normalizeUniform(value));
  };
  set("rate", rate);
  set("opacity", finite("opacity", config.opacity ?? 1, 0));
  set("twinkle", finite("twinkle", config.twinkle ?? 0, 0));
  set("perspective", finite("perspective", config.perspective ?? 1.5, 0));
  if (forces.gravity) set("gravity", vec3("forces.gravity", forces.gravity));
  if (forces.drag !== undefined) set("drag", finite("forces.drag", forces.drag, 0));
  if (forces.curl) {
    set("curlStrength", finite("forces.curl.strength", forces.curl.strength ?? 0.1));
    set("curlScale", finite("forces.curl.scale", forces.curl.scale ?? 1));
    set("curlSpeed", finite("forces.curl.speed", forces.curl.speed ?? 0.1));
  }
  if (forces.pointer) {
    set("pointerStrength", finite("forces.pointer.strength", forces.pointer.strength ?? 0.5));
    set("pointerRadius", finite("forces.pointer.radius", forces.pointer.radius ?? 0.2, 0));
  }

  const sdf = config.sdf ? resolveSdf(config.sdf, set) : null;

  const simulationRate = finite("simulationRate", options.simulationRate ?? 60, 0);
  if (simulationRate <= 0 || simulationRate > 1000) {
    throw new RangeError(`simulationRate must be in (0, 1000], got ${simulationRate}`);
  }
  const prewarm = finite("prewarm", options.prewarm ?? lifetime[1], 0);

  let pool: number;
  if (options.maxParticles !== undefined) {
    pool = options.maxParticles;
    if (!Number.isInteger(pool) || pool < 1 || pool > MAX_POOL) {
      throw new RangeError(`maxParticles must be an integer in [1, ${MAX_POOL}], got ${pool}`);
    }
  } else {
    pool = Math.min(Math.max(Math.ceil(rate * lifetime[1] * POOL_HEADROOM), MIN_POOL), MAX_POOL);
  }

  return {
    lifetime,
    area: [area[0], area[1], area[2], area[3]],
    depth,
    velocityMin,
    velocityMax,
    forces: {
      gravity: forces.gravity !== undefined,
      drag: forces.drag !== undefined,
      curl: forces.curl !== undefined,
      pointer: forces.pointer !== undefined
    },
    size,
    sizeOverLife,
    color,
    palette,
    sprite,
    spin,
    tumble: config.tumble ?? false,
    blend,
    sdf,
    uniforms,
    pool,
    simulationRate,
    prewarmSteps: Math.round(prewarm * simulationRate),
    seed: Math.trunc(finite("seed", options.seed ?? 1)) >>> 0
  };
};

const resolveSdf = (
  sdf: NonNullable<ParticleConfig["sdf"]>,
  set: (name: ParticleUniformName, value: UniformInput) => void
): ResolvedSdf => {
  const volume = sdf.volume as SdfVolume | undefined;
  const size = volume?.texture?.size;
  if (!volume || !Array.isArray(size) || size.length !== 3 || typeof volume.uniforms !== "function") {
    throw new TypeError("sdf.volume must be a volume from loadSdfVolume() of @frapx/glsl-sdf-volume");
  }
  const emit = sdf.emit ?? null;
  if (emit !== null && emit !== "surface" && emit !== "inside") {
    throw new RangeError(`Unknown sdf.emit: ${String(emit)}`);
  }
  const center = vec3("sdf.center", sdf.center ?? [0.5, 0.5, 0.5]);
  const sizeValue = finite("sdf.size", sdf.size ?? 0.5, 0);
  if (sizeValue <= 0) throw new RangeError(`sdf.size must be positive, got ${sizeValue}`);
  set("sdfCenter", center);
  set("sdfSize", sizeValue);
  set("sdfRotation", vec3("sdf.rotation", sdf.rotation ?? [0, 0, 0]));
  if (sdf.attract) {
    set("sdfAttractStrength", finite("sdf.attract.strength", sdf.attract.strength ?? 8));
    set("sdfAttractFalloff", finite("sdf.attract.falloff", sdf.attract.falloff ?? 0, 0));
  }
  if (sdf.collide) {
    set("sdfBounce", finite("sdf.collide.bounce", sdf.collide.bounce ?? 0, 0));
  }
  return { volume, attract: sdf.attract !== undefined, collide: sdf.collide !== undefined, emit };
};
