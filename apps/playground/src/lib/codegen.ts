/**
 * Install code for the four tabs. Pure: the same inputs always give the same
 * text, so the output is snapshot-tested.
 */
import type { Control } from "./annotations";
import { parseInclude } from "./include";
import type { Snippet } from "./snippets";

export type InstallTab = "html" | "vanilla" | "react" | "astro";

export const INSTALL_TABS: readonly InstallTab[] = ["html", "vanilla", "react", "astro"];

export type InstallInput = {
  /** The editor source, `// @include` lines and all. */
  readonly source: string;
  readonly controls: readonly Control[];
  /** Current value per control name; controls without one use their defaults. */
  readonly values: Readonly<Record<string, readonly number[]>>;
  readonly snippets: ReadonlyMap<string, Snippet>;
  /** Published version per package name, e.g. `{"@frapx/fx-canvas": "1.1.1"}`. */
  readonly versions: Readonly<Record<string, string>>;
  /** Baked SDF volumes bound with `@volume`, in source order. */
  readonly volumes?: readonly InstallVolume[];
};

export type InstallVolume = {
  /** The sampler's JS name: texture key and uniforms prefix. */
  readonly name: string;
  /** File name the snippet loads from the site's `sdf/` folder. */
  readonly file: string;
  /** Whether the file needs the zstd decoder. */
  readonly zstd: boolean;
};

const FX_CANVAS = "@frapx/fx-canvas";
const SDF_VOLUME = "@frapx/glsl-sdf-volume";
const FZSTD = "fzstd";
const REACT_CANVAS = "@frapx/react-canvas";

/** The version range a CDN URL pins: the major from 1.0, else major.minor. */
export const cdnRange = (version: string): string => {
  const [major = "0", minor = "0"] = version.split(".");
  return major === "0" ? `${major}.${minor}` : major;
};

const formatNumber = (value: number): string => {
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

const formatValue = (values: readonly number[]): string =>
  values.length === 1 ? formatNumber(values[0]!) : `[${values.map(formatNumber).join(", ")}]`;

type Prepared = {
  /** The shader as a `glsl` template literal, `${…}` in place of includes. */
  readonly literal: string;
  /** Imported bindings per module, `@frapx/fx-canvas` first. */
  readonly imports: ReadonlyMap<string, readonly string[]>;
  /** `name: value` lines for the `uniforms` object; empty when none. */
  readonly uniforms: readonly string[];
  /** `name: bakedX.texture` lines for the `textures` object; empty without volumes. */
  readonly textures: readonly string[];
  readonly volumes: readonly (InstallVolume & { readonly binding: string })[];
};

/**
 * Makes GLSL text safe inside a `glsl` template literal in a `<script>`.
 * GLSL itself never uses these characters outside comments; `glsl` is
 * String.raw, so the added backslash stays in the shader, where a comment
 * ignores it.
 */
export const escapeForLiteral = (text: string): string =>
  text.replace(/`|\$\{/g, (match) => `\\${match}`).replace(/<\/script/gi, "<\\/script");

const prepare = (input: InstallInput): Prepared => {
  const imports = new Map<string, Set<string>>([[FX_CANVAS, new Set(["glsl"])]]);
  const lines = input.source.replace(/\s+$/, "").split("\n").map((text) => {
    const name = parseInclude(text);
    const snippet = name === null ? undefined : input.snippets.get(name);
    if (snippet === undefined) return escapeForLiteral(text);
    const bindings = imports.get(snippet.module) ?? new Set<string>();
    bindings.add(snippet.binding);
    imports.set(snippet.module, bindings);
    return `\${${snippet.expression}}`;
  });
  // `#version` must stay on the first line of the shader, so it cannot sit
  // after a newline; GLSL ES 1.00 sources read better starting on their own.
  const body = lines.join("\n");
  const literal = `glsl\`${/^#version/.test(body) ? "" : "\n"}${body}\n\``;

  // u_sdf and u_Sdf would both be bakedSdf; number repeats.
  const usedBindings = new Set<string>();
  const volumes = (input.volumes ?? []).map((volume) => {
    const base = `baked${volume.name.charAt(0).toUpperCase()}${volume.name.slice(1)}`;
    let binding = base;
    for (let n = 2; usedBindings.has(binding); n++) binding = `${base}${n}`;
    usedBindings.add(binding);
    return { ...volume, binding };
  });
  if (volumes.length > 0) {
    const bindings = imports.get(SDF_VOLUME) ?? new Set<string>();
    bindings.add("loadSdfVolume");
    imports.set(SDF_VOLUME, bindings);
  }
  if (volumes.some((volume) => volume.zstd)) imports.set(FZSTD, new Set(["decompress"]));

  const uniforms = [
    ...volumes.map((volume) => `...${volume.binding}.uniforms("${volume.name}")`),
    ...input.controls.map(
      (control) => `${control.name}: ${formatValue(input.values[control.name] ?? control.defaults)}`
    )
  ];
  const textures = volumes.map((volume) => `${volume.name}: ${volume.binding}.texture`);

  return {
    literal,
    imports: new Map([...imports].map(([module, names]) => [module, [...names].sort()])),
    uniforms,
    textures,
    volumes
  };
};

const indent = (text: string, spaces: number): string =>
  text
    .split("\n")
    .map((line) => (line === "" ? line : " ".repeat(spaces) + line))
    .join("\n");

const importLines = (
  imports: ReadonlyMap<string, readonly string[]>,
  from: (module: string) => string
): string[] => [...imports].map(([module, names]) => `import { ${names.join(", ")} } from "${from(module)}";`);

/** The options object body shared by the vanilla-style tabs. */
const optionLines = (prepared: Prepared): string[] => [
  `target: ".hero",`,
  `fragment,`,
  ...(prepared.textures.length > 0 ? ["textures: {", ...objectLines(prepared.textures), "},"] : []),
  ...(prepared.uniforms.length > 0
    ? ["uniforms: {", ...objectLines(prepared.uniforms), "},"]
    : []),
  `// Holds a still frame when the visitor asks the OS to reduce motion.`,
  `respectReducedMotion: true,`,
  `// Stops drawing while the tab is in the background.`,
  `pauseWhenHidden: true,`,
  `onReady(instance) {`,
  `  // The background is decorative; hide it from assistive technology.`,
  `  instance.canvas?.setAttribute("aria-hidden", "true");`,
  `}`
];

const objectLines = (lines: readonly string[]): string[] =>
  lines.map((line, i) => `  ${line}${i < lines.length - 1 ? "," : ""}`);

const loadCall = (volume: Prepared["volumes"][number], folder: string): string =>
  volume.zstd
    ? `loadSdfVolume("${folder}${volume.file}", {\n  zstd: (bytes, size) => decompress(bytes, new Uint8Array(size))\n})`
    : `loadSdfVolume("${folder}${volume.file}")`;

const serveComment = (prepared: Prepared, folder: string): string[] =>
  prepared.volumes.map((volume) => `// Serve ${volume.file} at ${folder}${volume.file} (e.g. put it in public/sdf/).`);

/** createShaderBackground(...), after the volumes load when there are any. */
const createCall = (prepared: Prepared, folder = "/sdf/"): string => {
  const create = ["createShaderBackground({", indent(optionLines(prepared).join("\n"), 2), "});"].join("\n");
  const { volumes } = prepared;
  if (volumes.length === 0) return create;
  if (volumes.length === 1) {
    const volume = volumes[0]!;
    return [
      ...serveComment(prepared, folder),
      `${loadCall(volume, folder)}.then((${volume.binding}) => {`,
      indent(create, 2),
      "});"
    ].join("\n");
  }
  return [
    ...serveComment(prepared, folder),
    "Promise.all([",
    indent(volumes.map((volume) => loadCall(volume, folder)).join(",\n"), 2),
    `]).then(([${volumes.map((volume) => volume.binding).join(", ")}]) => {`,
    indent(create, 2),
    "});"
  ].join("\n");
};

const fxImports = (prepared: Prepared, add: string): Map<string, readonly string[]> => {
  const imports = new Map(prepared.imports);
  imports.set(FX_CANVAS, [...new Set([...(imports.get(FX_CANVAS) ?? []), add])].sort());
  return imports;
};

const installCommand = (modules: Iterable<string>): string => `npm install ${[...modules].join(" ")}`;

const HERO_STYLE = `.hero {
  position: relative;
  min-height: 100vh;
}
.hero-content {
  position: relative;
  z-index: 1;
  padding: 2rem;
}`;

const HERO_MARKUP = `<section class="hero">
  <div class="hero-content">
    <h1>Hello</h1>
  </div>
</section>`;

const html = (prepared: Prepared, input: InstallInput): string => {
  const url = (module: string) =>
    `https://cdn.jsdelivr.net/npm/${module}@${cdnRange(input.versions[module] ?? "0.0.0")}/+esm`;
  const script = [
    ...importLines(fxImports(prepared, "createShaderBackground"), url),
    "",
    `const fragment = ${prepared.literal};`,
    "",
    createCall(prepared, "./sdf/")
  ].join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>frapx</title>
    <style>
      body {
        margin: 0;
      }
${indent(HERO_STYLE, 6)}
    </style>
  </head>
  <body>
${indent(HERO_MARKUP, 4)}
    <script type="module">
${indent(script, 6)}
    </script>
  </body>
</html>
`;
};

const vanilla = (prepared: Prepared): string => {
  const imports = fxImports(prepared, "createShaderBackground");
  return [
    `// ${installCommand(imports.keys())}`,
    ...importLines(imports, (module) => module),
    "",
    `const fragment = ${prepared.literal};`,
    "",
    createCall(prepared),
    ""
  ].join("\n");
};

const react = (prepared: Prepared): string => {
  const { volumes } = prepared;
  const props = [
    "fragment={fragment}",
    ...(volumes.length > 0 ? ["textures={textures}"] : []),
    // Inline, so TypeScript reads vectors as tuples (works in .jsx too).
    ...(prepared.uniforms.length > 0
      ? ["uniforms={{", ...objectLines(prepared.uniforms), "}}"]
      : []),
    "// Holds a still frame when the visitor asks the OS to reduce motion.",
    "respectReducedMotion",
    "// Stops drawing while the tab is in the background.",
    "pauseWhenHidden",
    "// The background is decorative; hide it from assistive technology.",
    'aria-hidden="true"',
    'style={{ position: "absolute", inset: 0 }}'
  ];
  const background = ["<ShaderBackground", indent(props.join("\n"), 2), "/>"].join("\n");
  const hero = (inner: string) => [
    "export function Hero() {",
    "  return (",
    '    <section style={{ position: "relative", minHeight: "100vh" }}>',
    indent(inner, 6),
    '      <div style={{ position: "relative", zIndex: 1, padding: "2rem" }}>',
    "        <h1>Hello</h1>",
    "      </div>",
    "    </section>",
    "  );",
    "}"
  ];

  const header = [
    `// ${installCommand([REACT_CANVAS, ...prepared.imports.keys()])}`,
    ...(volumes.length > 0
      ? ["// React 19: use() below reads the loading volume.", 'import { Suspense, use, useMemo } from "react";']
      : []),
    `import { ShaderBackground } from "${REACT_CANVAS}";`,
    ...importLines(prepared.imports, (module) => module),
    "",
    `const fragment = ${prepared.literal};`,
    ""
  ];
  if (volumes.length === 0) return [...header, ...hero(background), ""].join("\n");

  return [
    ...header,
    ...serveComment(prepared, "/sdf/"),
    "// Started once in the browser (never during server rendering). A failed",
    "// load (e.g. a missing file) resolves to null and leaves the page as is.",
    ...volumes.map(
      (volume) =>
        `const ${volume.binding}Load =\n  typeof window === "undefined"\n    ? null\n${indent(
          `: ${loadCall(volume, "/sdf/")}.catch((error) => {\n  console.error(error);\n  return null;\n});`,
          4
        )}`
    ),
    "",
    "function Background() {",
    ...volumes.map(
      (volume) => `  const ${volume.binding} = ${volume.binding}Load ? use(${volume.binding}Load) : null;`
    ),
    "  // Memoized: a new textures object would upload the volume again.",
    "  const textures = useMemo(",
    `    () => (${volumes.map((volume) => volume.binding).join(" && ")} ? { ${prepared.textures.join(", ")} } : undefined),`,
    `    [${volumes.map((volume) => volume.binding).join(", ")}]`,
    "  );",
    `  if (${volumes.map((volume) => `!${volume.binding}`).join(" || ")} || !textures) return null;`,
    "  return (",
    indent(background, 4),
    "  );",
    "}",
    "",
    ...hero(["<Suspense fallback={null}>", "  <Background />", "</Suspense>"].join("\n")),
    ""
  ].join("\n");
};

const astro = (prepared: Prepared): string => {
  const imports = fxImports(prepared, "createShaderBackground");
  const script = [
    ...importLines(imports, (module) => module),
    "",
    `const fragment = ${prepared.literal};`,
    "",
    createCall(prepared)
  ].join("\n");
  return `---
// ${installCommand(imports.keys())}
// The runtime needs the browser, so it runs in <script>, not in this frontmatter.
---

${HERO_MARKUP}

<style>
${indent(HERO_STYLE, 2)}
</style>

<script>
${indent(script, 2)}
</script>
`;
};

export const generateInstallCode = (input: InstallInput): Record<InstallTab, string> => {
  const prepared = prepare(input);
  return {
    html: html(prepared, input),
    vanilla: vanilla(prepared),
    react: react(prepared),
    astro: astro(prepared)
  };
};
