import { describe, expect, it } from "vitest";
import { parseControls, parseHexColor, toHexColor } from "./annotations";

describe("parseControls", () => {
  it("reads a float range with default and step", () => {
    expect(parseControls("uniform float u_speed; // @range 0 2 @default 1 @step 0.01")).toEqual([
      { kind: "range", name: "speed", type: "float", line: 1, min: 0, max: 2, step: 0.01, defaults: [1] }
    ]);
  });

  it("fills vector components from one default, or takes one per component", () => {
    const [a, b] = parseControls(
      [
        "uniform vec2 u_offset; // @range -1 1 @default 0.5",
        "uniform highp vec3 u_scale; // @range 0 4 @default 1 2 3"
      ].join("\n")
    );
    expect(a).toMatchObject({ type: "vec2", defaults: [0.5, 0.5], line: 1 });
    expect(b).toMatchObject({ type: "vec3", defaults: [1, 2, 3], line: 2 });
  });

  it("clamps a default into the range", () => {
    expect(parseControls("uniform vec2 u_a; // @range 0 1 @default 5 -2")[0]?.defaults).toEqual([1, 0]);
  });

  it("defaults to min and a hundredth of the range", () => {
    expect(parseControls("uniform float u_x; // @range 2 4")[0]).toMatchObject({
      defaults: [2],
      step: 0.02
    });
  });

  it("reads colors for vec3 and vec4", () => {
    const [rgb, rgba] = parseControls(
      ["uniform vec3 u_tint; // @color @default #ff8000", "uniform vec4 u_fill; // @color @default #00000080"].join(
        "\n"
      )
    );
    expect(rgb).toMatchObject({ kind: "color", type: "vec3", defaults: [1, 128 / 255, 0] });
    expect(rgba).toMatchObject({ kind: "color", type: "vec4", defaults: [0, 0, 0, 128 / 255] });
  });

  it("gives vec4 colors without alpha an opaque alpha", () => {
    expect(parseControls("uniform vec4 u_fill; // @color @default #ffffff")[0]?.defaults).toEqual([1, 1, 1, 1]);
  });

  it("skips built-in and unannotated uniforms", () => {
    const source = [
      "uniform float u_time; // @range 0 10",
      "uniform vec2 u_resolution; // @range 0 1",
      "uniform float u_plain;",
      "uniform float u_note; // just a comment",
      "uniform float speed; // @range 0 1"
    ].join("\n");
    expect(parseControls(source)).toEqual([]);
  });

  it.each([
    ["missing range", "uniform float u_a; // @default 1"],
    ["one bound", "uniform float u_a; // @range 1"],
    ["min not below max", "uniform float u_a; // @range 2 1"],
    ["non-number", "uniform float u_a; // @range 0 x"],
    ["zero step", "uniform float u_a; // @range 0 1 @step 0"],
    ["wrong default count", "uniform vec3 u_a; // @range 0 1 @default 1 2"],
    ["unknown tag", "uniform float u_a; // @range 0 1 @fancy"],
    ["repeated tag", "uniform float u_a; // @range 0 1 @range 0 2"],
    ["color on float", "uniform float u_a; // @color @default #ffffff"],
    ["bad hex", "uniform vec3 u_a; // @color @default #fff"],
    ["color with range", "uniform vec3 u_a; // @color @range 0 1"]
  ])("ignores a malformed annotation: %s", (_, source) => {
    expect(parseControls(source)).toEqual([]);
  });

  it("keeps the first of two declarations", () => {
    const controls = parseControls(
      "uniform float u_a; // @range 0 1\nuniform float u_a; // @range 0 9"
    );
    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({ max: 1 });
  });
});

describe("hex colors", () => {
  it("round-trips", () => {
    expect(toHexColor(parseHexColor("#26738c")!)).toBe("#26738c");
    expect(toHexColor([2, -1, 0.5, 0.3])).toBe("#ff0080");
  });
});
