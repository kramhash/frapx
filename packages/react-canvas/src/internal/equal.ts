import { useRef } from "react";

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

/**
 * Compares arrays and plain objects by contents and everything else (images,
 * canvases, functions) by identity.
 */
export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]))
    );
  }
  return false;
};

/**
 * Returns the previous value while it is deeply equal to `value`, so an inline
 * literal with the same contents keeps its identity as an effect dependency.
 */
export const useDeepStable = <T>(value: T): T => {
  const ref = useRef(value);
  if (!deepEqual(ref.current, value)) ref.current = value;
  return ref.current;
};
