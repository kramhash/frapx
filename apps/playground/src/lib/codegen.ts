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
};

const FX_CANVAS = "@frapx/fx-canvas";
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
};

const prepare = (input: InstallInput): Prepared => {
  const imports = new Map<string, Set<string>>([[FX_CANVAS, new Set(["glsl"])]]);
  const lines = input.source.replace(/\s+$/, "").split("\n").map((text) => {
    const name = parseInclude(text);
    const snippet = name === null ? undefined : input.snippets.get(name);
    if (snippet === undefined) return text;
    const bindings = imports.get(snippet.module) ?? new Set<string>();
    bindings.add(snippet.binding);
    imports.set(snippet.module, bindings);
    return `\${${snippet.expression}}`;
  });
  // `#version` must stay on the first line of the shader, so it cannot sit
  // after a newline; GLSL ES 1.00 sources read better starting on their own.
  const body = lines.join("\n");
  const literal = `glsl\`${/^#version/.test(body) ? "" : "\n"}${body}\n\``;

  const uniforms = input.controls.map(
    (control) => `${control.name}: ${formatValue(input.values[control.name] ?? control.defaults)}`
  );

  return {
    literal,
    imports: new Map([...imports].map(([module, names]) => [module, [...names].sort()])),
    uniforms
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

const createCall = (prepared: Prepared): string =>
  ["createShaderBackground({", indent(optionLines(prepared).join("\n"), 2), "});"].join("\n");

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
    createCall(prepared)
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
  const props = [
    "fragment={fragment}",
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
  return [
    `// ${installCommand([REACT_CANVAS, ...prepared.imports.keys()])}`,
    `import { ShaderBackground } from "${REACT_CANVAS}";`,
    ...importLines(prepared.imports, (module) => module),
    "",
    `const fragment = ${prepared.literal};`,
    "",
    "export function Hero() {",
    "  return (",
    '    <section style={{ position: "relative", minHeight: "100vh" }}>',
    "      <ShaderBackground",
    indent(props.join("\n"), 8),
    "      />",
    '      <div style={{ position: "relative", zIndex: 1, padding: "2rem" }}>',
    "        <h1>Hello</h1>",
    "      </div>",
    "    </section>",
    "  );",
    "}",
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
