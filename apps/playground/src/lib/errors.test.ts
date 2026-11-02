import { ShaderCompileError } from "@frapx/fx-canvas";
import { describe, expect, it } from "vitest";
import { glslVersion, toEditorProblems, unknownIncludeProblems } from "./errors";
import { expandIncludes } from "./include";

const source = "precision highp float;\n// @include two\nvoid main() {\n  oops\n}";
const expanded = expandIncludes(source, (name) => (name === "two" ? "float a;\nfloat b;" : undefined));

const compileError = (line: number, message: string) =>
  new ShaderCompileError("compile failed", {
    stage: "fragment",
    lines: [{ line, message, source: "", context: [] }]
  });

describe("toEditorProblems", () => {
  it("maps a line after an include back to the editor line", () => {
    // Expanded line 5 is "  oops", editor line 4.
    const { problems, overlay } = toEditorProblems(compileError(5, "syntax error"), expanded, source);
    expect(problems).toEqual([{ line: 4, message: "syntax error" }]);
    expect(overlay.lines?.[0]?.line).toBe(4);
    expect(overlay.lines?.[0]?.context.map((row) => row.line)).toEqual([2, 3, 4, 5]);
  });

  it("puts an error inside a snippet on its include line", () => {
    const { problems } = toEditorProblems(compileError(3, "redefinition"), expanded, source);
    expect(problems).toEqual([{ line: 2, message: "in @include two: redefinition" }]);
  });

  it("puts errors without located lines on line 1", () => {
    const { problems, overlay } = toEditorProblems(new Error("link failed"), expanded, source);
    expect(problems).toEqual([{ line: 1, message: "link failed" }]);
    expect(overlay.message).toBe("link failed");
  });
});

describe("unknownIncludeProblems", () => {
  it("reports each unknown include", () => {
    const result = expandIncludes("// @include nope", () => undefined);
    expect(unknownIncludeProblems(result)).toEqual([{ line: 1, message: 'Unknown snippet "nope"' }]);
  });
});

describe("glslVersion", () => {
  it("detects #version 300 es on the first line only", () => {
    expect(glslVersion("#version 300 es\nprecision highp float;")).toBe("300 es");
    expect(glslVersion("precision highp float;")).toBe("100");
    expect(glslVersion("// #version 300 es")).toBe("100");
  });
});
