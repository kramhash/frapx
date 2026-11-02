import { useCallback, useMemo, useState } from "react";
import type { Control } from "../lib/annotations";
import type { UniformValues } from "../lib/uniforms";

// A slider keeps its value only while its annotation is unchanged; editing
// the range or default in the source resets it to the new default.
const signature = (control: Control): string =>
  control.kind === "range"
    ? `range:${control.type}:${control.min}:${control.max}:${control.defaults.join(",")}`
    : `color:${control.type}:${control.defaults.join(",")}`;

type Edited = Readonly<Record<string, { readonly signature: string; readonly value: readonly number[] }>>;

/** Current value per control, and a setter for slider input. */
export function useUniformValues(
  controls: readonly Control[]
): [UniformValues, (control: Control, value: readonly number[]) => void] {
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

  const setValue = useCallback((control: Control, value: readonly number[]) => {
    setEdited((previous) => ({ ...previous, [control.name]: { signature: signature(control), value } }));
  }, []);

  return [values, setValue];
}
