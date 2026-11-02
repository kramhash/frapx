import { describe, expect, it } from "vitest";
import { expandIncludes, parseInclude, sourceLineOf } from "./include";

const registry: Record<string, string> = {
  two: "float a;\nfloat b;",
  "glslUtils.coverUv": "vec2 coverUv();"
};
const lookup = (name: string) => registry[name];

describe("parseInclude", () => {
  it("reads bare and bracketed names", () => {
    expect(parseInclude("// @include two")).toBe("two");
    expect(parseInclude("  //@include <glslUtils.coverUv>  ")).toBe("glslUtils.coverUv");
  });

  it("ignores other lines", () => {
    expect(parseInclude("float x; // @include two")).toBeNull();
    expect(parseInclude("// @includes two")).toBeNull();
    expect(parseInclude("// @include")).toBeNull();
  });
});

describe("expandIncludes", () => {
  it("expands a snippet at the include position", () => {
    const result = expandIncludes("precision highp float;\n// @include two\nvoid main() {}", lookup);
    expect(result.code).toBe("precision highp float;\nfloat a;\nfloat b;\nvoid main() {}");
    expect(result.includes).toEqual([{ line: 2, name: "two" }]);
    expect(result.unknown).toEqual([]);
  });

  it("maps expanded lines back to the editor", () => {
    const result = expandIncludes("x\n// @include two\ny", lookup);
    expect(result.lineMap).toEqual([
      { line: 1, include: null },
      { line: 2, include: "two" },
      { line: 2, include: "two" },
      { line: 3, include: null }
    ]);
    expect(sourceLineOf(result, 4)).toEqual({ line: 3, include: null });
    expect(sourceLineOf(result, 9)).toBeNull();
  });

  it("keeps unknown includes as comments and reports them", () => {
    const result = expandIncludes("// @include nope\n// @include two", lookup);
    expect(result.code).toBe("// @include nope\nfloat a;\nfloat b;");
    expect(result.unknown).toEqual([{ line: 1, name: "nope" }]);
    expect(result.lineMap[0]).toEqual({ line: 1, include: null });
  });

  it("leaves a source without includes unchanged", () => {
    const source = "a\nb\n";
    const result = expandIncludes(source, lookup);
    expect(result.code).toBe(source);
    expect(result.lineMap).toHaveLength(3);
  });
});
