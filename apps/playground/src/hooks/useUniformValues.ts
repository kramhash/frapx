import { useCallback, useMemo, useState } from "react";
import { parseControls } from "../lib/annotations";
import type { Control } from "../lib/annotations";
import type { UniformValues } from "../lib/uniforms";

// A slider keeps its value only while its annotation is unchanged; editing
// the range or default in the source resets it to the new default.
const signature = (control: Control): string =>
  control.kind === "range"
    ? `range:${control.type}:${control.min}:${control.max}:${control.defaults.join(",")}`
    : `color:${control.type}:${control.defaults.join(",")}`;

type Edited = Readonly<Record<string, { readonly signature: string; readonly value: readonly number[] }>>;

export type UniformValueActions = {
  readonly set: (control: Control, value: readonly number[]) => void;
  /** Replaces every value with `values` for the controls `source` declares (a shared link). */
  readonly restore: (source: string, values: UniformValues) => void;
};

/** Current value per control, and the actions that change them. */
export function useUniformValues(controls: readonly Control[]): [UniformValues, UniformValueActions] {
  const [edited, setEdited] = useState<Edited>({});

  const values = useMemo(() => {
    const result: Record<string, readonly number[]> = {};
    for (const control of controls) {
      const entry = edited[control.name];
      result[control.name] =
        entry !== undefined && entry.signature === signature(control) ? entry.value : control.defaults;
    }
    return result;
  }, [controls, edited]);

  const set = useCallback((control: Control, value: readonly number[]) => {
    setEdited((previous) => ({ ...previous, [control.name]: { signature: signature(control), value } }));
  }, []);

  const restore = useCallback((source: string, shared: UniformValues) => {
    const next: Record<string, { signature: string; value: readonly number[] }> = {};
    for (const control of parseControls(source)) {
      const value = shared[control.name];
      if (value !== undefined && value.length === control.defaults.length) {
        next[control.name] = { signature: signature(control), value };
      }
    }
    setEdited(next);
  }, []);

  const actions = useMemo(() => ({ set, restore }), [set, restore]);
  return [values, actions];
}
