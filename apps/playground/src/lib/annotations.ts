/**
 * Uniform annotations: a trailing comment on a `uniform` line, e.g.
 *
 *   uniform float u_speed; // @range 0 2 @default 1 @step 0.01
 *   uniform vec3 u_tint;   // @color @default #ff8800
 *
 * Pure, so the sliders and the generated install code read it the same way.
 */

export type UniformKind = "float" | "vec2" | "vec3" | "vec4";

type ControlBase = {
  /** The JS name passed to setUniform (`u_` dropped). */
  readonly name: string;
  readonly type: UniformKind;
  /** 1-based line in the editor source. */
  readonly line: number;
  /** Initial value, one entry per component. */
  readonly defaults: readonly number[];
};

export type RangeControl = ControlBase & {
  readonly kind: "range";
  readonly min: number;
  readonly max: number;
  readonly step: number;
};

export type ColorControl = ControlBase & { readonly kind: "color"; readonly type: "vec3" | "vec4" };

export type Control = RangeControl | ColorControl;

// Supplied by the runtime; never given a control even when annotated.
export const BUILT_IN_UNIFORMS: ReadonlySet<string> = new Set([
  "u_resolution",
  "u_viewportSize",
  "u_pixelRatio",
  "u_time",
  "u_delta",
  "u_pointer",
  "u_pointerUv",
  "u_pointerActive",
  "u_reducedMotion"
]);

const COMPONENTS: Record<UniformKind, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };

const UNIFORM =
  /^\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(float|vec2|vec3|vec4)\s+(u_\w+)\s*;\s*\/\/(.*)$/;

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;

const parseNumbers = (words: readonly string[]): number[] | null => {
  if (words.length === 0 || !words.every((word) => NUMBER.test(word))) return null;
  return words.map(Number);
};

/** `#rrggbb` or `#rrggbbaa` to 0..1 components. */
export const parseHexColor = (text: string): number[] | null => {
  const match = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
  if (match === null) return null;
  const hex = match[1]!;
  const channels: number[] = [];
  for (let i = 0; i < hex.length; i += 2) channels.push(parseInt(hex.slice(i, i + 2), 16) / 255);
  return channels;
};

const toHexByte = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");

/** 0..1 RGB(A) to `#rrggbb`; alpha is dropped. */
export const toHexColor = (values: readonly number[]): string =>
  `#${values.slice(0, 3).map(toHexByte).join("")}`;

/** `{ range: ["0", "2"], default: ["1"] }` from `@range 0 2 @default 1`. */
const readTags = (comment: string): Map<string, string[]> | null => {
  const tags = new Map<string, string[]>();
  const parts = comment.trim().split(/\s+/).filter(Boolean);
  let current: string[] | null = null;
  for (const part of parts) {
    if (part.startsWith("@")) {
      const tag = part.slice(1);
      if (tag === "" || tags.has(tag)) return null;
      current = [];
      tags.set(tag, current);
    } else if (current === null) {
      // Free text before the first tag: an ordinary comment.
      return null;
    } else {
      current.push(part);
    }
  }
  return tags;
};

const parseControl = (
  type: UniformKind,
  uniform: string,
  line: number,
  comment: string
): Control | null => {
  const tags = readTags(comment);
  if (tags === null || tags.size === 0) return null;
  const name = uniform.slice(2);
  const components = COMPONENTS[type];

  if (tags.has("color")) {
    if (type !== "vec3" && type !== "vec4") return null;
    if (tags.get("color")!.length > 0 || tags.has("range") || tags.has("step")) return null;
    const written = tags.get("default");
    let color: number[] = [0, 0, 0];
    if (written !== undefined) {
      const parsed = written.length === 1 ? parseHexColor(written[0]!) : null;
      if (parsed === null) return null;
      color = parsed;
    }
    const defaults = type === "vec3" ? color.slice(0, 3) : [...color.slice(0, 3), color[3] ?? 1];
    return { kind: "color", name, type, line, defaults };
  }

  const range = tags.get("range");
  const bounds = range === undefined ? null : parseNumbers(range);
  if (bounds === null || bounds.length !== 2) return null;
  const [min, max] = bounds as [number, number];
  if (!(min < max)) return null;

  let step = (max - min) / 100;
  const stepWords = tags.get("step");
  if (stepWords !== undefined) {
    const parsed = parseNumbers(stepWords);
    if (parsed === null || parsed.length !== 1 || !(parsed[0]! > 0)) return null;
    step = parsed[0]!;
  }

  let defaults = Array.from({ length: components }, () => min);
  const defaultWords = tags.get("default");
  if (defaultWords !== undefined) {
    const parsed = parseNumbers(defaultWords);
    if (parsed === null) return null;
    // One value fills every component.
    if (parsed.length === 1) defaults = defaults.map(() => parsed[0]!);
    else if (parsed.length === components) defaults = parsed;
    else return null;
  }

  for (const tag of tags.keys()) {
    if (tag !== "range" && tag !== "default" && tag !== "step") return null;
  }
  return { kind: "range", name, type, line, min, max, step, defaults };
};

/**
 * Controls for every annotated, non-built-in `u_` uniform, in source order.
 * Malformed annotations are ignored (no control); a uniform declared twice
 * keeps its first control.
 */
export const parseControls = (source: string): Control[] => {
  const controls: Control[] = [];
  const seen = new Set<string>();
  source.split("\n").forEach((text, index) => {
    const match = UNIFORM.exec(text);
    if (match === null) return;
    // The pattern guarantees all three groups.
    const type = match[1] as UniformKind;
    const uniform = match[2]!;
    const comment = match[3]!;
    if (BUILT_IN_UNIFORMS.has(uniform) || seen.has(uniform)) return;
    const control = parseControl(type, uniform, index + 1, comment);
    if (control === null) return;
    seen.add(uniform);
    controls.push(control);
  });
  return controls;
};
