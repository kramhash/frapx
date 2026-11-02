import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createShaderBackground } from "@frapx/fx-canvas";
import type { ShaderBackgroundInstance } from "@frapx/fx-canvas";
import { createErrorOverlay } from "@frapx/tool-dev";
import type { ErrorOverlay } from "@frapx/tool-dev";
import { glslVersion, toEditorProblems, unknownIncludeProblems } from "../lib/errors";
import type { EditorProblem } from "../lib/errors";
import type { ExpandedSource } from "../lib/include";

type Running = { readonly fx: ShaderBackgroundInstance; readonly version: "100" | "300 es" };

/**
 * Renders `expanded` into `target`. Edits go through setFragment() so time
 * and uniforms carry over; a new instance is created only when the GLSL
 * version changes or the current instance never compiled or is unsupported (growth plan
 * decision 17). Returns the problems to show in the editor.
 */
export function usePreview(
  target: RefObject<HTMLElement | null>,
  source: string,
  expanded: ExpandedSource
): readonly EditorProblem[] {
  const running = useRef<Running | null>(null);
  const overlay = useRef<ErrorOverlay | null>(null);
  const [problems, setProblems] = useState<readonly EditorProblem[]>([]);

  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    overlay.current = createErrorOverlay({ parent: element, position: "bottom" });
    return () => {
      running.current?.fx.destroy();
      running.current = null;
      overlay.current?.destroy();
      overlay.current = null;
    };
  }, [target]);

  useEffect(() => {
    const element = target.current;
    const errors = overlay.current;
    if (element === null || errors === null) return;

    const included = unknownIncludeProblems(expanded);
    const succeed = () => {
      errors.clear();
      setProblems(included);
    };
    const fail = (error: unknown) => {
      const mapped = toEditorProblems(error, expanded, source);
      errors.show(mapped.overlay);
      setProblems([...included, ...mapped.problems]);
    };

    const version = glslVersion(expanded.code);
    const current = running.current;
    // An instance that never compiled, or has no context (e.g. 300 es without
    // WebGL2), returns null from setFragment without drawing anything, so it
    // is replaced to report the error again.
    const usable =
      current !== null &&
      current.version === version &&
      current.fx.status !== "error" &&
      current.fx.status !== "unsupported";
    if (current !== null && usable) {
      const error = current.fx.setFragment(expanded.code);
      if (error === null) succeed();
      else fail(error);
      return;
    }

    current?.fx.destroy();
    const fx = createShaderBackground({ target: element, fragment: expanded.code });
    running.current = { fx, version };
    // Ignore an instance that was replaced before it settled.
    fx.ready.then(
      () => {
        if (running.current?.fx === fx) succeed();
      },
      (error: unknown) => {
        if (running.current?.fx === fx) fail(error);
      }
    );
  }, [target, source, expanded]);

  return problems;
}
