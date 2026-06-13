import type { CreateShaderBackgroundOptions, DprOption } from "../types";

export type DomSetup = {
  target: Element;
  canvas: HTMLCanvasElement;
  createdCanvas: boolean;
  restoredPosition: string | null;
};

export const resolveElement = (
  target: string | Element | undefined
): Element | null => {
  if (!target) return null;
  if (typeof target === "string") return document.querySelector(target);
  return target;
};

export const setupCanvas = (
  options: CreateShaderBackgroundOptions
): DomSetup | null => {
  const target = resolveElement(options.target);
  const canvas = options.canvas ?? document.createElement("canvas");
  const measurementTarget = target ?? options.canvas;

  if (!measurementTarget) return null;

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

export const resolveDpr = (
  dpr: DprOption | undefined,
  maxDpr: number | undefined
): number => {
  const raw =
    typeof dpr === "function"
      ? dpr()
      : typeof dpr === "number"
        ? dpr
        : typeof window === "undefined"
          ? 1
          : window.devicePixelRatio || 1;

  return Math.max(1, Math.min(raw, maxDpr ?? 2));
};

export const resizeCanvasToTarget = (
  canvas: HTMLCanvasElement,
  target: Element,
  dpr: number
): {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
} => {
  const rect = target.getBoundingClientRect();
  const viewportWidth = Math.max(1, rect.width || canvas.clientWidth || 1);
  const viewportHeight = Math.max(1, rect.height || canvas.clientHeight || 1);
  const width = Math.max(1, Math.round(viewportWidth * dpr));
  const height = Math.max(1, Math.round(viewportHeight * dpr));

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  return { width, height, viewportWidth, viewportHeight };
};

const applyCanvasStyle = (
  canvas: HTMLCanvasElement,
  options: CreateShaderBackgroundOptions,
  shouldPosition: boolean
): void => {
  canvas.dataset.frapxShaderCanvas = "";

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
