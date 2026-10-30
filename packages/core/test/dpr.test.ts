import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDprOptions, resolveDpr } from "../src/internal/dom";

describe("resolveDpr", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const withDevice = (devicePixelRatio: number) => {
    vi.stubGlobal("window", { devicePixelRatio });
  };

  it("caps auto at maxDpr, 2 by default", () => {
    withDevice(3);
    expect(resolveDpr(undefined, undefined)).toBe(2);
    expect(resolveDpr("auto", undefined)).toBe(2);
    expect(resolveDpr("auto", 1.5)).toBe(1.5);
    expect(resolveDpr("auto", 4)).toBe(3);
  });

  it("lets auto follow a device ratio below 1", () => {
    withDevice(0.8);
    expect(resolveDpr("auto", undefined)).toBe(0.8);
  });

  it("treats a missing window as 1", () => {
    expect(resolveDpr("auto", undefined)).toBe(1);
  });

  it("uses a number as given unless maxDpr is set", () => {
    expect(resolveDpr(3, undefined)).toBe(3);
    expect(resolveDpr(3, 1.5)).toBe(1.5);
    expect(resolveDpr(1.5, 4)).toBe(1.5);
    expect(resolveDpr(0.5, undefined)).toBe(0.5);
    expect(resolveDpr(0.5, 2)).toBe(0.5);
  });

  it("uses a function's value as given unless maxDpr is set", () => {
    expect(resolveDpr(() => 3, undefined)).toBe(3);
    expect(resolveDpr(() => 3, 2)).toBe(2);
    expect(resolveDpr(() => 0.5, undefined)).toBe(0.5);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws RangeError for dpr %s",
    (value) => {
      expect(() => resolveDpr(value, undefined)).toThrow(RangeError);
      expect(() => resolveDpr(() => value, undefined)).toThrow(RangeError);
    }
  );

  it.each([0, -1, Number.NaN])("throws RangeError for maxDpr %s", (value) => {
    withDevice(2);
    expect(() => resolveDpr("auto", value)).toThrow(RangeError);
    expect(() => resolveDpr(1, value)).toThrow(RangeError);
  });
});

describe("assertDprOptions", () => {
  it("checks numbers and leaves functions for later", () => {
    expect(() => assertDprOptions(0, undefined)).toThrow(RangeError);
    expect(() => assertDprOptions("auto", Number.NaN)).toThrow(RangeError);
    expect(() => assertDprOptions(() => 0, undefined)).not.toThrow();
    expect(() => assertDprOptions(0.5, 1)).not.toThrow();
  });
});
