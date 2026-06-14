import { describe, expect, it } from "vitest";
import { hexToRgb, hexToRgba } from "../src/color";

describe("color helpers", () => {
  it("converts short and long hex values to rgb tuples", () => {
    expect(hexToRgb("#336699")).toEqual([0.2, 0.4, 0.6]);
    expect(hexToRgb("369")).toEqual([0.2, 0.4, 0.6]);
  });

  it("ignores alpha when converting to rgb", () => {
    expect(hexToRgb("#336699cc")).toEqual([0.2, 0.4, 0.6]);
    expect(hexToRgb("369c")).toEqual([0.2, 0.4, 0.6]);
  });

  it("converts hex values to rgba tuples", () => {
    expect(hexToRgba("#336699")).toEqual([0.2, 0.4, 0.6, 1]);
    expect(hexToRgba("336699cc")).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(hexToRgba("#369c")).toEqual([0.2, 0.4, 0.6, 0.8]);
  });

  it("throws on invalid hex input", () => {
    expect(() => hexToRgb("0x336699")).toThrow("Invalid hex color");
    expect(() => hexToRgb("#12")).toThrow("Invalid hex color");
    expect(() => hexToRgba("tomato")).toThrow("Invalid hex color");
  });
});
