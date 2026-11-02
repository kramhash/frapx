/**
 * `// @include <name>` expansion. Pure, so the preview and the generated
 * install code (#92) share one reading of the source.
 */

const INCLUDE = /^\s*\/\/\s*@include\s+<?([\w.]+)>?\s*$/;

export type IncludeLine = {
  /** 1-based line in the editor source. */
  readonly line: number;
  readonly name: string;
};

export type ExpandedSource = {
  readonly code: string;
  /**
   * For each 1-based line of `code` (index line - 1): the editor line it came
   * from, and the snippet name when it came from an include.
   */
  readonly lineMap: readonly { readonly line: number; readonly include: string | null }[];
  /** Every include line, resolved or not, in source order. */
  readonly includes: readonly IncludeLine[];
  /** Include lines whose name is not in the registry. They stay as comments. */
  readonly unknown: readonly IncludeLine[];
};

export const parseInclude = (text: string): string | null => INCLUDE.exec(text)?.[1] ?? null;

export const expandIncludes = (
  source: string,
  lookup: (name: string) => string | undefined
): ExpandedSource => {
  const out: string[] = [];
  const lineMap: { line: number; include: string | null }[] = [];
  const includes: IncludeLine[] = [];
  const unknown: IncludeLine[] = [];

  source.split("\n").forEach((text, index) => {
    const line = index + 1;
    const name = parseInclude(text);
    if (name === null) {
      out.push(text);
      lineMap.push({ line, include: null });
      return;
    }
    includes.push({ line, name });
    const snippet = lookup(name);
    if (snippet === undefined) {
      unknown.push({ line, name });
      out.push(text);
      lineMap.push({ line, include: null });
      return;
    }
    for (const snippetLine of snippet.split("\n")) {
      out.push(snippetLine);
      lineMap.push({ line, include: name });
    }
  });

  return { code: out.join("\n"), lineMap, includes, unknown };
};

/** Maps a 1-based line of the expanded code back to the editor. */
export const sourceLineOf = (
  expanded: ExpandedSource,
  line: number
): { line: number; include: string | null } | null => expanded.lineMap[line - 1] ?? null;
