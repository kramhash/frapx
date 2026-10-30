import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/internal/config";
import { renderFragment, renderVertex, simulationVertex } from "../src/internal/shaders";
import { tinyVolume } from "./sdfVolume";

describe("shader codegen", () => {
  it("includes only the configured forces", () => {
    const bare = simulationVertex(resolveConfig({}));
    expect(bare).not.toContain("u_gravity");
    expect(bare).not.toContain("frapx_curl3d");
    expect(bare).not.toContain("u_drag");

    const full = simulationVertex(
      resolveConfig({ forces: { gravity: [0, -1, 0], drag: 1, curl: {}, pointer: {} } })
    );
    expect(full).toContain("acceleration += u_gravity;");
    expect(full).toContain("vec3 frapx_curl3d(vec3 p)");
    expect(full).toContain("velocity *= exp(-u_drag * u_dt);");
    expect(full).toContain("u_pointerStrength");
  });

  it("generates only the configured sdf parts", () => {
    expect(simulationVertex(resolveConfig({}))).not.toContain("u_sdfVolume");

    const placed = simulationVertex(resolveConfig({ sdf: { volume: tinyVolume() } }));
    expect(placed).toContain("uniform highp sampler3D u_sdfVolume;");
    expect(placed).toContain("frapx_sdfSetup();");
    expect(placed).not.toContain("u_sdfAttractStrength");
    expect(placed).not.toContain("u_sdfBounce");
    expect(placed).not.toContain("frapx_sdfSpawn");
    expect(placed).toContain("frapx_random(spawn, 1u)");

    const full = simulationVertex(
      resolveConfig({ sdf: { volume: tinyVolume(), attract: {}, collide: {}, emit: "inside" } })
    );
    expect(full).toContain("acceleration -= normal * d * u_sdfAttractStrength * fade;");
    expect(full).toContain("velocity -= (1.0 + u_sdfBounce) * inward * normal;");
    expect(full).toContain("vec3 spawnPosition = frapx_sdfSpawn(spawn);");
    expect(full).toContain("i < 16u");
    // The emitter area is not read when the shape spawns.
    expect(full).not.toContain("frapx_random(spawn, 1u)");

    const surface = simulationVertex(resolveConfig({ sdf: { volume: tinyVolume(), emit: "surface" } }));
    expect(surface).toContain("i < 1u");
    expect(surface).not.toContain("if (d < 0.0) return");
  });

  it("bakes the sprite shape, size curve and tumble", () => {
    const config = resolveConfig({ sprite: "ring", sizeOverLife: "fadeOut", tumble: true });
    expect(renderFragment(config)).toContain("0.62");
    expect(renderVertex(config)).toContain("1.0 - smoothstep(0.8, 1.0, life)");
    expect(renderVertex(config)).toContain("corner.x *= cos");
    expect(renderFragment(resolveConfig({ sprite: "/flake.png" }))).toContain("uniform sampler2D u_sprite;");
  });
});
