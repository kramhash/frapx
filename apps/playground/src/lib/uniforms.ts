import type { UniformInput } from "@frapx/fx-canvas";

export type UniformValues = Readonly<Record<string, readonly number[]>>;

/** One control's components as the runtime's scalar or vector input. */
export const toUniformInput = (value: readonly number[]): UniformInput => {
  const [x = 0, y = 0, z = 0, w = 0] = value;
  switch (value.length) {
    case 1:
      return x;
    case 2:
      return [x, y];
    case 3:
      return [x, y, z];
    default:
      return [x, y, z, w];
  }
};

export const toUniformInputs = (values: UniformValues): Record<string, UniformInput> =>
  Object.fromEntries(Object.entries(values).map(([name, value]) => [name, toUniformInput(value)]));
