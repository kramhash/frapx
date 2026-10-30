import {
  createBlitter as coreCreateBlitter,
  createPingPong as coreCreatePingPong,
  createRenderTarget as coreCreateRenderTarget,
  supportsRenderTargetFormat as coreSupportsRenderTargetFormat
} from "@frapx/core";
import type {
  Blitter as CoreBlitter,
  PingPong as CorePingPong,
  RenderTarget as CoreRenderTarget,
  RenderTargetFormat as CoreRenderTargetFormat,
  RenderTargetOptions as CoreRenderTargetOptions
} from "@frapx/core";

// Re-declared rather than re-exported so that `@deprecated` reaches users'
// editors. Removed in 1.0.

/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export const createBlitter = coreCreateBlitter;
/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export const createPingPong = coreCreatePingPong;
/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export const createRenderTarget = coreCreateRenderTarget;
/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export const supportsRenderTargetFormat = coreSupportsRenderTargetFormat;

/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export type Blitter = CoreBlitter;
/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export type PingPong = CorePingPong;
/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export type RenderTarget = CoreRenderTarget;
/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export type RenderTargetFormat = CoreRenderTargetFormat;
/** @deprecated Import from `@frapx/core`; core is 0.x and makes no stability promise. Removed from fx-canvas in 1.0. */
export type RenderTargetOptions = CoreRenderTargetOptions;
