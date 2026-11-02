/**
 * Baked SDF volumes bound with `uniform highp sampler3D u_<name>; // @volume <value>`.
 * The value is a bundled sample id or a `.sdf.ktx2` file name; the source is
 * the single source of truth, so share URLs carry the name, never the file.
 */

export type VolumeSample = {
  readonly id: string;
  readonly label: string;
  /** File name under the playground's `sdf/` folder. */
  readonly file: string;
  readonly zstd: boolean;
};

export const VOLUME_SAMPLES: readonly VolumeSample[] = [
  { id: "suzanne", label: "Suzanne", file: "Suzanne.r8-zstd.sdf.ktx2", zstd: true }
];

export const DEFAULT_VOLUME_SAMPLE = VOLUME_SAMPLES[0]!;

export const findSample = (value: string): VolumeSample | undefined =>
  VOLUME_SAMPLES.find((sample) => sample.id === value);

export type VolumeSlot = {
  /** The JS name (`u_` dropped): texture key and uniforms prefix. */
  readonly name: string;
  /** 1-based line in the editor source. */
  readonly line: number;
  /** A sample id or a file name. */
  readonly value: string;
};

const SAMPLER =
  /^(\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler3D\s+(u_\w+)\s*;\s*\/\/\s*@volume\s+)(\S+)(\s*)$/;

const SAMPLE_ID = /^[a-z][a-z0-9-]*$/;
const FILE_NAME = /^[\w.-]+\.sdf\.ktx2$/i;

export const isVolumeValue = (value: string): boolean => SAMPLE_ID.test(value) || FILE_NAME.test(value);

export const isFileValue = (value: string): boolean => FILE_NAME.test(value);

/** Every `@volume`-annotated `sampler3D` with a well-formed value, in source order. */
export const parseVolumes = (source: string): VolumeSlot[] => {
  const slots: VolumeSlot[] = [];
  const seen = new Set<string>();
  source.split("\n").forEach((text, index) => {
    const match = SAMPLER.exec(text);
    if (match === null) return;
    const uniform = match[2]!;
    const value = match[3]!;
    if (seen.has(uniform) || !isVolumeValue(value)) return;
    seen.add(uniform);
    slots.push({ name: uniform.slice(2), line: index + 1, value });
  });
  return slots;
};

/** `source` with the `@volume` value of sampler `u_<name>` replaced; unchanged if absent. */
export const setVolumeValue = (source: string, name: string, value: string): string =>
  source
    .split("\n")
    .map((text) => {
      const match = SAMPLER.exec(text);
      return match !== null && match[2] === `u_${name}` ? `${match[1]}${value}${match[4]}` : text;
    })
    .join("\n");

/** The file an install snippet loads for `value`, and whether it is known to need zstd. */
export const volumeFile = (
  value: string,
  knownZstd: boolean | undefined
): { readonly file: string; readonly zstd: boolean } => {
  const sample = findSample(value);
  return sample !== undefined ? { file: sample.file, zstd: sample.zstd } : { file: value, zstd: knownZstd ?? false };
};
