import type { SdfVolume } from "../src";

/** A 2³ volume shaped like loadSdfVolume()'s result, for codegen and config tests. */
export const tinyVolume = (): SdfVolume => {
  const meta = {
    version: 1 as const,
    bboxMin: [-1, -1, -1] as const,
    bboxMax: [1, 1, 1] as const,
    voxelSize: 1,
    decode: { scale: 1, offset: 0 }
  };
  return {
    texture: {
      data: new Float32Array(8),
      size: [2, 2, 2],
      format: "r32f",
      filter: "linear",
      wrap: "clamp"
    },
    uniforms: <N extends string = "sdf">(name: N = "sdf" as N) =>
      ({
        [`${name}Min`]: meta.bboxMin,
        [`${name}Max`]: meta.bboxMax,
        [`${name}Scale`]: 1,
        [`${name}Offset`]: 0
      }) as ReturnType<SdfVolume["uniforms"]>,
    meta
  } as SdfVolume;
};
