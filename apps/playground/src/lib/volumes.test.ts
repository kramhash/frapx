import { describe, expect, it } from "vitest";
import { parseVolumes, setVolumeValue, volumeFile } from "./volumes";

describe("parseVolumes", () => {
  it("reads samples and file names on sampler3D lines", () => {
    const source = [
      "uniform highp sampler3D u_sdf; // @volume suzanne",
      "uniform sampler3D u_other; // @volume My_Mesh.r16f.sdf.ktx2"
    ].join("\n");
    expect(parseVolumes(source)).toEqual([
      { name: "sdf", line: 1, value: "suzanne" },
      { name: "other", line: 2, value: "My_Mesh.r16f.sdf.ktx2" }
    ]);
  });

  it.each([
    ["a sampler2D", "uniform sampler2D u_tex; // @volume suzanne"],
    ["a float", "uniform float u_a; // @volume suzanne"],
    ["no value", "uniform highp sampler3D u_sdf; // @volume"],
    ["a space", "uniform highp sampler3D u_sdf; // @volume a b.sdf.ktx2"],
    ["a quote", "uniform highp sampler3D u_sdf; // @volume a\"b.sdf.ktx2"],
    ["a path", "uniform highp sampler3D u_sdf; // @volume ../secret.sdf.ktx2"],
    ["another extension", "uniform highp sampler3D u_sdf; // @volume mesh.ktx2"],
    ["a URL", "uniform highp sampler3D u_sdf; // @volume https://example.com/a.sdf.ktx2"],
    ["no u_ prefix", "uniform highp sampler3D sdf; // @volume suzanne"],
    ["no annotation", "uniform highp sampler3D u_sdf;"]
  ])("ignores %s", (_, source) => {
    expect(parseVolumes(source)).toEqual([]);
  });

  it("accepts file names in any script", () => {
    expect(parseVolumes("uniform highp sampler3D u_sdf; // @volume 頭部_v2.sdf.ktx2")).toEqual([
      { name: "sdf", line: 1, value: "頭部_v2.sdf.ktx2" }
    ]);
  });

  it("keeps the first of two declarations", () => {
    const slots = parseVolumes(
      "uniform highp sampler3D u_sdf; // @volume suzanne\nuniform highp sampler3D u_sdf; // @volume a.sdf.ktx2"
    );
    expect(slots).toEqual([{ name: "sdf", line: 1, value: "suzanne" }]);
  });
});

describe("setVolumeValue", () => {
  it("replaces only that sampler's value", () => {
    const source = "uniform highp sampler3D u_sdf; // @volume suzanne\nuniform highp sampler3D u_b; // @volume suzanne";
    expect(setVolumeValue(source, "sdf", "Mesh.sdf.ktx2")).toBe(
      "uniform highp sampler3D u_sdf; // @volume Mesh.sdf.ktx2\nuniform highp sampler3D u_b; // @volume suzanne"
    );
    expect(setVolumeValue(source, "missing", "x.sdf.ktx2")).toBe(source);
  });
});

describe("volumeFile", () => {
  it("maps samples to their file and zstd flag", () => {
    expect(volumeFile("suzanne", undefined)).toEqual({ file: "Suzanne.r8-zstd.sdf.ktx2", zstd: true });
    expect(volumeFile("Mesh.sdf.ktx2", true)).toEqual({ file: "Mesh.sdf.ktx2", zstd: true });
    expect(volumeFile("Mesh.sdf.ktx2", undefined)).toEqual({ file: "Mesh.sdf.ktx2", zstd: false });
  });
});
