import { describe, expect, it, vi } from "vitest";
import { resolveDpr } from "../src/internal/dom";

describe("resolveDpr", () => {
  it("caps auto dpr", () => {
    vi.stubGlobal("window", { devicePixelRatio: 3 });
    expect(resolveDpr("auto", 2)).toBe(2);
    vi.unstubAllGlobals();
  });

  it("accepts number and function dpr", () => {
    expect(resolveDpr(1.5, 2)).toBe(1.5);
    expect(resolveDpr(() => 3, 2)).toBe(2);
  });
});
