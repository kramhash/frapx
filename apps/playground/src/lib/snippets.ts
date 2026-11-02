import { glslUtils } from "@frapx/fx-canvas";
import * as noise from "@frapx/glsl-noise";
import * as raymarch from "@frapx/glsl-raymarch";
import * as sdf from "@frapx/glsl-sdf";
import * as sdfVolume from "@frapx/glsl-sdf-volume";

/** A GLSL snippet that `// @include <name>` can pull in. */
export type Snippet = {
  /** The package the generated install code imports it from. */
  readonly module: string;
  /** The import binding, e.g. `fbm3d` or `glslUtils`. */
  readonly binding: string;
  /** The expression the generated code interpolates, e.g. `glslUtils.coverUv`. */
  readonly expression: string;
  readonly source: string;
};

const pick = <T extends Record<string, unknown>>(
  module: string,
  exports: T,
  names: readonly (keyof T & string)[]
): [string, Snippet][] =>
  names.map((name) => {
    const source = exports[name];
    if (typeof source !== "string") throw new Error(`${module} has no snippet ${name}`);
    return [name, { module, binding: name, expression: name, source }];
  });

// The public snippet exports only. The *Body / *Common / *License parts are
// building blocks the combined exports already contain.
export const snippets: ReadonlyMap<string, Snippet> = new Map([
  ...pick("@frapx/glsl-noise", noise, [
    "noise3d",
    "simplex3d",
    "simplex3dGrad",
    "curl3d",
    "perlin3d",
    "periodicPerlin3d",
    "fbm3d"
  ]),
  ...pick("@frapx/glsl-sdf", sdf, ["sdf", "sdf2d", "sdf3d", "sdfOps", "sdfDomain"]),
  ...pick("@frapx/glsl-raymarch", raymarch, [
    "raymarch",
    "raymarchCamera",
    "raymarchCameraUniforms"
  ]),
  ...pick("@frapx/glsl-sdf-volume", sdfVolume, ["sdfVolume"]),
  ...Object.entries(glslUtils).map(([key, source]): [string, Snippet] => [
    `glslUtils.${key}`,
    {
      module: "@frapx/fx-canvas",
      binding: "glslUtils",
      expression: `glslUtils.${key}`,
      source
    }
  ])
]);
