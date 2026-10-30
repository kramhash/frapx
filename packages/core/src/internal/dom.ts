import type { DprOption, Resolution, SetupCanvasOptions } from "../types";

export type DomSetup = {
  target: Element;
  canvas: HTMLCanvasElement;
  createdCanvas: boolean;
  restoredPosition: string | null;
  /** True when the canvas was created without being attached to the document. */
  detached?: boolean;
};

export type CanvasSize = {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

export const resolveElement = (
  target: string | Element | undefined
): Element | null => {
  if (!target) return null;
  if (typeof target === "string") return document.querySelector(target);
  return target;
};

export const setupCanvas = (options: SetupCanvasOptions): DomSetup | null => {
  const target = resolveElement(options.target);
  const canvas = options.canvas ?? document.createElement("canvas");
  const measurementTarget = target ?? options.canvas;

  if (!measurementTarget) {
    if (!options.detached) return null;
    canvas.dataset.frapxCanvas = "";
    return {
      target: canvas,
      canvas,
      createdCanvas: true,
      restoredPosition: null,
      detached: true
    };
  }

  const createdCanvas = !options.canvas;
  const restoredPosition =
    target && getComputedStyle(target).position === "static"
      ? (target as HTMLElement).style.position
      : null;

  if (target && restoredPosition !== null) {
    (target as HTMLElement).style.position = "relative";
  }

  applyCanvasStyle(canvas, options, createdCanvas);

  if (options.canvasClass) {
    canvas.classList.add(options.canvasClass);
  }

  if (options.canvasStyle) {
    Object.assign(canvas.style, options.canvasStyle);
  }

  if (createdCanvas && target) {
    if ((options.layer ?? "background") === "overlay") {
      target.append(canvas);
    } else {
      target.prepend(canvas);
    }
  }

  return {
    target: measurementTarget,
    canvas,
    createdCanvas,
    restoredPosition
  };
};

/**
 * `"auto"` follows `devicePixelRatio`, capped by `maxDpr` (default 2). A
 * number or function is used as given and capped only when `maxDpr` is set.
 * Values below 1 are allowed; `<= 0` or non-finite throws `RangeError`.
 */
export const resolveDpr = (
  dpr: DprOption | undefined,
  maxDpr: number | undefined
): number => {
  if (dpr === undefined || dpr === "auto") {
    const device =
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    return Math.min(device, assertPositive("maxDpr", maxDpr ?? 2));
  }

  const raw = assertPositive("dpr", typeof dpr === "function" ? dpr() : dpr);
  return maxDpr === undefined ? raw : Math.min(raw, assertPositive("maxDpr", maxDpr));
};

/** Checks the static parts of the dpr options; a `dpr` function is checked when it is called. */
export const assertDprOptions = (
  dpr: DprOption | undefined,
  maxDpr: number | undefined
): void => {
  if (typeof dpr === "number") assertPositive("dpr", dpr);
  if (maxDpr !== undefined) assertPositive("maxDpr", maxDpr);
};

const assertPositive = (name: string, value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`\`${name}\` must be a finite number above 0, got ${value}`);
  }
  return value;
};

export const resizeCanvasToTarget = (
  canvas: HTMLCanvasElement,
  target: Element,
  dpr: number
): CanvasSize => {
  const rect = target.getBoundingClientRect();
  const viewportWidth = Math.max(1, rect.width || canvas.clientWidth || 1);
  const viewportHeight = Math.max(1, rect.height || canvas.clientHeight || 1);
  const width = Math.max(1, Math.round(viewportWidth * dpr));
  const height = Math.max(1, Math.round(viewportHeight * dpr));

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  return { width, height, viewportWidth, viewportHeight };
};

/**
 * Sizes the canvas to a fixed internal resolution. The viewport size still
 * comes from the target so `u_viewportSize` reflects the displayed size; a
 * detached canvas has no layout, so its viewport equals the resolution.
 */
export const resizeCanvasToResolution = (
  canvas: HTMLCanvasElement,
  target: Element | null,
  resolution: Resolution
): CanvasSize => {
  const [width, height] = resolution;
  let viewportWidth = width;
  let viewportHeight = height;

  if (target) {
    const rect = target.getBoundingClientRect();
    viewportWidth = Math.max(1, rect.width || canvas.clientWidth || 1);
    viewportHeight = Math.max(1, rect.height || canvas.clientHeight || 1);
  }

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  return { width, height, viewportWidth, viewportHeight };
};

const applyCanvasStyle = (
  canvas: HTMLCanvasElement,
  options: SetupCanvasOptions,
  shouldPosition: boolean
): void => {
  canvas.dataset.frapxCanvas = "";

  if (!shouldPosition) return;

  const layer = options.layer ?? "background";
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    pointerEvents: "none",
    zIndex: layer === "overlay" ? "1" : "0"
  });
};
