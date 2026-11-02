import { describe, expect, it } from "vitest";
import { parseControls } from "./annotations";
import { cdnRange, generateInstallCode, INSTALL_TABS } from "./codegen";
import type { Snippet } from "./snippets";

const snippets = new Map<string, Snippet>([
  ["fbm3d", { module: "@frapx/glsl-noise", binding: "fbm3d", expression: "fbm3d", source: "float frapx_fbm3d(vec3 p);" }],
  [
    "glslUtils.rotate2d",
    { module: "@frapx/fx-canvas", binding: "glslUtils", expression: "glslUtils.rotate2d", source: "mat2 rotate2d(float a);" }
  ]
]);

const versions = {
  "@frapx/fx-canvas": "1.1.1",
  "@frapx/react-canvas": "1.0.0",
  "@frapx/glsl-noise": "0.3.0"
};

const source = `precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed; // @range 0 4 @default 1.5
uniform vec3 u_tint; // @color @default #ff8000

// @include fbm3d
// @include glslUtils.rotate2d

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  gl_FragColor = vec4(u_tint * frapx_fbm3d(vec3(uv, u_time * u_speed)), 1.0);
}
`;

const generate = (text: string, values: Record<string, number[]> = {}) =>
  generateInstallCode({ source: text, controls: parseControls(text), values, snippets, versions });

describe("generateInstallCode", () => {
  const code = generate(source, { speed: [0.25] });

  it.each(INSTALL_TABS)("%s tab", (tab) => {
    expect(code[tab]).toMatchSnapshot();
  });

  it("replaces includes with imports and interpolations", () => {
    expect(code.vanilla).toContain('import { fbm3d } from "@frapx/glsl-noise";');
    expect(code.vanilla).toContain('import { createShaderBackground, glsl, glslUtils } from "@frapx/fx-canvas";');
    expect(code.vanilla).toContain("${fbm3d}");
    expect(code.vanilla).toContain("${glslUtils.rotate2d}");
    expect(code.vanilla).not.toContain("@include");
  });

  it("bakes the current slider values, falling back to the defaults", () => {
    expect(code.vanilla).toContain("speed: 0.25,");
    expect(code.vanilla).toContain("tint: [1, 0.502, 0]");
  });

  it("pins CDN URLs to the installed major (or minor below 1.0)", () => {
    expect(code.html).toContain("https://cdn.jsdelivr.net/npm/@frapx/fx-canvas@1/+esm");
    expect(code.html).toContain("https://cdn.jsdelivr.net/npm/@frapx/glsl-noise@0.3/+esm");
  });

  it("keeps #version on the first line of the literal", () => {
    const es3 = generate("#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main() { color = vec4(1.0); }");
    expect(es3.vanilla).toContain("const fragment = glsl`#version 300 es\n");
    expect(es3.vanilla).not.toContain("uniforms:");
    expect(es3.react).not.toContain("uniforms");
  });

  it("escapes backticks, ${ and </script> so the literal still parses", () => {
    const text = "// see `rotate2d`, ${fbm3d} and </script>\nvoid main() {}";
    const html = generate(text).html;
    expect(html).toContain("// see \\`rotate2d\\`, \\${fbm3d} and <\\/script>");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    const literal = /const fragment = (glsl`[\s\S]*?\n`);/.exec(generate(text).vanilla)?.[1];
    const evaluate = new Function("glsl", `return ${literal};`) as (tag: typeof String.raw) => string;
    expect(evaluate(String.raw)).toContain("void main() {}");
  });

  it("leaves unknown includes as comments", () => {
    expect(generate("// @include nope\nvoid main() {}").vanilla).toContain("// @include nope");
  });
});

describe("generateInstallCode with baked volumes", () => {
  const volumeSource = `#version 300 es
precision highp float;
uniform highp sampler3D u_sdf; // @volume suzanne
uniform float u_level; // @range 0 1 @default 0.5
out vec4 fragColor;
void main() { fragColor = vec4(u_level); }`;
  const withVolumes = (volumes: { name: string; file: string; zstd: boolean }[]) =>
    generateInstallCode({
      source: volumeSource,
      controls: parseControls(volumeSource),
      values: {},
      snippets,
      versions: { ...versions, "@frapx/glsl-sdf-volume": "0.1.0", fzstd: "0.1.1" },
      volumes
    });
  const zstd = withVolumes([{ name: "sdf", file: "Suzanne.r8-zstd.sdf.ktx2", zstd: true }]);

  it.each(INSTALL_TABS)("%s tab with a zstd volume", (tab) => {
    expect(zstd[tab]).toMatchSnapshot();
  });

  it("loads the volume before creating the background", () => {
    expect(zstd.vanilla).toContain('import { loadSdfVolume } from "@frapx/glsl-sdf-volume";');
    expect(zstd.vanilla).toContain('import { decompress } from "fzstd";');
    expect(zstd.vanilla).toContain(".then((bakedSdf) => {");
    expect(zstd.vanilla).toContain("sdf: bakedSdf.texture");
    expect(zstd.vanilla).toContain('...bakedSdf.uniforms("sdf"),');
    expect(zstd.vanilla).toContain("npm install @frapx/fx-canvas @frapx/glsl-sdf-volume fzstd");
    expect(zstd.html).toContain('loadSdfVolume("./sdf/Suzanne.r8-zstd.sdf.ktx2"');
    expect(zstd.html).toContain("https://cdn.jsdelivr.net/npm/fzstd@0.1/+esm");
  });

  it("leaves out fzstd for an uncompressed volume", () => {
    const plain = withVolumes([{ name: "sdf", file: "Mesh.r16f.sdf.ktx2", zstd: false }]);
    expect(plain.vanilla).not.toContain("fzstd");
    expect(plain.vanilla).toContain('loadSdfVolume("/sdf/Mesh.r16f.sdf.ktx2").then(');
  });

  it("waits for every volume", () => {
    const two = withVolumes([
      { name: "sdf", file: "A.sdf.ktx2", zstd: false },
      { name: "other", file: "B.sdf.ktx2", zstd: true }
    ]);
    expect(two.vanilla).toContain("]).then(([bakedSdf, bakedOther]) => {");
    expect(two.react).toContain("const bakedOther = bakedOtherLoad ? use(bakedOtherLoad) : null;");
    expect(two.react).toContain("if (!bakedSdf || !bakedOther || !textures) return null;");
  });

  it("numbers bindings that would collide", () => {
    const clash = withVolumes([
      { name: "sdf", file: "A.sdf.ktx2", zstd: false },
      { name: "Sdf", file: "B.sdf.ktx2", zstd: false }
    ]);
    expect(clash.vanilla).toContain("]).then(([bakedSdf, bakedSdf2]) => {");
    expect(clash.vanilla).toContain("Sdf: bakedSdf2.texture");
  });

  it("keeps React loading out of server rendering and failures off the page", () => {
    expect(zstd.react).toContain('typeof window === "undefined"');
    expect(zstd.react).toContain(".catch((error) => {");
    expect(zstd.react).toContain("// React 19: use() below reads the loading volume.");
  });

  it("produces JavaScript that parses", () => {
    const body = zstd.vanilla.replace(/^import .*$/gm, "");
    expect(() => new Function("glsl", "createShaderBackground", "loadSdfVolume", "decompress", body)).not.toThrow();
  });
});

describe("cdnRange", () => {
  it("uses the major from 1.0 and major.minor below", () => {
    expect(cdnRange("1.4.2")).toBe("1");
    expect(cdnRange("0.3.0")).toBe("0.3");
  });
});
