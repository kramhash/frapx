import { describe, expect, it } from "vitest";
import { mergeConfig, resolveConfig } from "../src/internal/config";
import { presets } from "../src/presets";
import { tinyVolume } from "./sdfVolume";

describe("resolveConfig", () => {
  it("merges options over a preset, forces field by field", () => {
    const config = resolveConfig({ preset: "snow", forces: { pointer: { strength: 1 } }, rate: 10 });
    expect(config.forces).toEqual({ gravity: true, drag: true, curl: true, pointer: true });
    expect(config.uniforms.get("rate")?.value).toEqual([10]);
    expect(config.uniforms.get("pointerStrength")?.value).toEqual([1]);
    expect(config.uniforms.get("pointerRadius")?.value).toEqual([0.2]);
  });

  it("merges nested curl settings", () => {
    const merged = mergeConfig(presets.snow, { forces: { curl: { strength: 0.5 } } });
    expect(merged.forces?.curl).toEqual({ strength: 0.5, scale: 1.2, speed: 0.1 });
    expect(merged.forces?.gravity).toEqual([0, -0.12, 0]);
  });

  it("creates force uniforms only for configured forces", () => {
    const config = resolveConfig({ forces: { drag: 0.5 } });
    expect([...config.uniforms.keys()].sort()).toEqual(["drag", "opacity", "perspective", "rate", "twinkle"]);
  });

  it("creates sdf uniforms for the placement and the configured parts only", () => {
    const placed = resolveConfig({ sdf: { volume: tinyVolume() } });
    expect(placed.sdf).toMatchObject({ attract: false, collide: false, emit: null });
    expect(placed.uniforms.get("sdfCenter")?.value).toEqual([0.5, 0.5, 0.5]);
    expect(placed.uniforms.get("sdfSize")?.value).toEqual([0.5]);
    expect(placed.uniforms.get("sdfRotation")?.value).toEqual([0, 0, 0]);
    expect(placed.uniforms.has("sdfAttractStrength")).toBe(false);
    expect(placed.uniforms.has("sdfBounce")).toBe(false);

    const full = resolveConfig({
      sdf: { volume: tinyVolume(), size: 0.3, attract: { falloff: 0.1 }, collide: { bounce: 0.4 }, emit: "surface" }
    });
    expect(full.sdf).toMatchObject({ attract: true, collide: true, emit: "surface" });
    expect(full.uniforms.get("sdfAttractStrength")?.value).toEqual([8]);
    expect(full.uniforms.get("sdfAttractFalloff")?.value).toEqual([0.1]);
    expect(full.uniforms.get("sdfBounce")?.value).toEqual([0.4]);
  });

  it("rejects an invalid sdf", () => {
    expect(() => resolveConfig({ sdf: { volume: {} as never } })).toThrow("loadSdfVolume()");
    expect(() => resolveConfig({ sdf: { volume: tinyVolume(), size: 0 } })).toThrow("sdf.size");
    expect(() => resolveConfig({ sdf: { volume: tinyVolume(), emit: "edge" as never } })).toThrow("sdf.emit");
    expect(() => resolveConfig({ sdf: { volume: tinyVolume(), collide: { bounce: -1 } } })).toThrow("sdf.collide.bounce");
  });

  it("sizes the pool from the rate and longest lifetime", () => {
    expect(resolveConfig({ rate: 100, lifetime: [1, 4] }).pool).toBe(500);
    expect(resolveConfig({ rate: 0 }).pool).toBe(16);
    expect(resolveConfig({ rate: 100, maxParticles: 64 }).pool).toBe(64);
  });

  it("prewarms the longest lifetime by default", () => {
    expect(resolveConfig({ lifetime: [1, 3] }).prewarmSteps).toBe(180);
    expect(resolveConfig({ lifetime: [1, 3], prewarm: 0 }).prewarmSteps).toBe(0);
    expect(resolveConfig({ lifetime: [1, 3], simulationRate: 120, prewarm: 0.5 }).prewarmSteps).toBe(60);
  });

  it("rejects invalid values", () => {
    expect(() => resolveConfig({ preset: "rain" as never })).toThrow(RangeError);
    expect(() => resolveConfig({ lifetime: [3, 1] })).toThrow(RangeError);
    expect(() => resolveConfig({ lifetime: [0, 1] })).toThrow(RangeError);
    expect(() => resolveConfig({ rate: -1 })).toThrow(RangeError);
    expect(() => resolveConfig({ maxParticles: 1.5 })).toThrow(RangeError);
    expect(() => resolveConfig({ simulationRate: 0 })).toThrow(RangeError);
    expect(() => resolveConfig({ sprite: "star" as never })).toThrow(RangeError);
    expect(() => resolveConfig({ color: "#zzz" })).toThrow();
  });

  it("treats a non-shape sprite as a texture", () => {
    expect(resolveConfig({ sprite: "/flake.png" }).sprite).toEqual({ texture: "/flake.png" });
    expect(resolveConfig({ sprite: "ring" }).sprite).toBe("ring");
  });

  it("resolves every preset", () => {
    for (const name of Object.keys(presets)) {
      expect(() => resolveConfig({ preset: name as keyof typeof presets })).not.toThrow();
    }
  });
});
