import { ShaderCompileError } from "@frapx/fx-canvas";
import type { OverlayError } from "@frapx/tool-dev";
import { sourceLineOf } from "./include";
import type { ExpandedSource } from "./include";

/** A problem located in the editor source (1-based line). */
export type EditorProblem = { readonly line: number; readonly message: string };

const CONTEXT = 2;

const contextAround = (sourceLines: readonly string[], line: number) => {
  const rows: { line: number; source: string }[] = [];
  for (let n = Math.max(1, line - CONTEXT); n <= Math.min(sourceLines.length, line + CONTEXT); n++) {
    rows.push({ line: n, source: sourceLines[n - 1] ?? "" });
  }
  return rows;
};

/**
 * Rewrites a compile error so its lines point at the editor source instead of
 * the include-expanded code: an error inside a snippet lands on its
 * `// @include` line.
 */
export const toEditorProblems = (
  error: unknown,
  expanded: ExpandedSource,
  source: string
): { problems: EditorProblem[]; overlay: OverlayError } => {
  const sourceLines = source.split("\n");
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);

  if (!(error instanceof ShaderCompileError) || error.lines.length === 0) {
    return {
      problems: [{ line: 1, message }],
      overlay: { name, message, stage: error instanceof ShaderCompileError ? error.stage : null }
    };
  }

  const problems: EditorProblem[] = [];
  const lines: { line: number; message: string; context: { line: number; source: string }[] }[] =
    [];
  for (const entry of error.lines) {
    const mapped = sourceLineOf(expanded, entry.line);
    const line = Math.min(mapped?.line ?? entry.line, Math.max(1, sourceLines.length));
    const text = mapped?.include ? `in @include ${mapped.include}: ${entry.message}` : entry.message;
    problems.push({ line, message: text });
    lines.push({ line, message: text, context: contextAround(sourceLines, line) });
  }
  return { problems, overlay: { name, message, stage: error.stage, lines } };
};

export const unknownIncludeProblems = (
  expanded: ExpandedSource,
  message: (name: string) => string
): EditorProblem[] => expanded.unknown.map(({ line, name }) => ({ line, message: message(name) }));

/** `"300 es"` when the code opens with `#version 300 es`, else GLSL ES 1.00. */
export const glslVersion = (code: string): "100" | "300 es" =>
  /^\s*#version\s+300\s+es\b/.test(code) ? "300 es" : "100";
