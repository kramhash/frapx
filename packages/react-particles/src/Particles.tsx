import {
  type BlendMode,
  type CaptureFormat,
  type CaptureOptions,
  type CaptureResult,
  type ClockMode,
  type ColorStop,
  type ParticleUniformName,
  type ParticlesInstance,
  type Resolution,
  type UniformInput,
  type UniformSource
} from "@frapx/fx-particles";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  type CSSProperties,
  type HTMLAttributes
} from "react";
import { omitUndefined } from "./internal/omitUndefined";
import { useParticles, type UseParticlesOptions } from "./useParticles";

export type ParticlesHandle = {
  getInstance(): ParticlesInstance | null;
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
  setTime(seconds: number): void;
  setClock(clock: ClockMode): void;
  setResolution(resolution: Resolution | null): void;
  /** Rejects while no instance is mounted. */
  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>>;
  reset(): void;
  setUniform(name: ParticleUniformName, value: UniformInput): void;
  setUniforms(values: Partial<Record<ParticleUniformName, UniformInput>>): void;
  /**
   * Binds one more source on the current instance; it is not rebound if the
   * instance is recreated (use the `uniformSources` prop for that). Returns
   * the removal function, a no-op while no instance is mounted.
   */
  bindUniforms(source: UniformSource): () => void;
  setColor(color: string | readonly ColorStop[]): void;
  setPalette(palette: readonly string[] | null): void;
  setBlend(blend: BlendMode): void;
};

export type ParticlesProps = UseParticlesOptions &
  Omit<HTMLAttributes<HTMLDivElement>, keyof UseParticlesOptions | "children"> & {
    recreateKey?: unknown;
  };

// All keys of UseParticlesOptions. The `satisfies` check prevents typos;
// _assertComplete below catches omissions. Add here whenever fx-particles adds options.
const OPTION_KEYS = [
  "canvas",
  "preset",
  "rate",
  "lifetime",
  "emitter",
  "velocity",
  "forces",
  "size",
  "sizeOverLife",
  "color",
  "palette",
  "opacity",
  "sprite",
  "spin",
  "tumble",
  "twinkle",
  "blend",
  "perspective",
  "sdf",
  "maxParticles",
  "simulationRate",
  "prewarm",
  "seed",
  "format",
  "formatFallback",
  "layer",
  "autoStart",
  "pauseWhenOffscreen",
  "pauseWhenHidden",
  "respectReducedMotion",
  "clock",
  "timeSource",
  "resolution",
  "dpr",
  "maxDpr",
  "autoResize",
  "debug",
  "canvasClass",
  "canvasStyle",
  "onParticlesReady",
  "onParticlesError",
  "onStatusChange",
  "uniformSources",
] as const satisfies readonly (keyof UseParticlesOptions)[];

// Fails to compile if any UseParticlesOptions key is absent from OPTION_KEYS.
type _MissingOptionKey = Exclude<keyof UseParticlesOptions, (typeof OPTION_KEYS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertComplete: _MissingOptionKey extends never ? true : never = true;

const OPTION_KEY_SET = new Set<string>(OPTION_KEYS);

const noop = (): void => {};

const defaultStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden"
};

/**
 * Renders particles into a transparent canvas inside a wrapper div. Options
 * are compared by value; see `useParticles` for what changes in place.
 */
export const Particles = forwardRef<ParticlesHandle, ParticlesProps>((props, forwardedRef) => {
  // Cast to record for key-based picking; correctness is enforced structurally
  // by OPTION_KEYS (satisfies) + _assertComplete above.
  const propsRecord = props as Record<string, unknown>;

  const { recreateKey, className, style } = props;

  // Pick particle options by OPTION_KEYS so they never leak as unknown DOM
  // attributes on the wrapper div.
  const optionEntries: Record<string, unknown> = {};
  for (const key of OPTION_KEYS) {
    if (key in propsRecord) optionEntries[key] = propsRecord[key];
  }
  const options = omitUndefined(optionEntries) as UseParticlesOptions;

  const domEntries: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(propsRecord)) {
    if (!OPTION_KEY_SET.has(k) && k !== "recreateKey" && k !== "className" && k !== "style") {
      domEntries[k] = v;
    }
  }

  const { ref, instance } = useParticles(options, [recreateKey]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      getInstance: () => instance,
      start: () => instance?.start(),
      stop: () => instance?.stop(),
      render: () => instance?.render(),
      resize: () => instance?.resize(),
      destroy: () => instance?.destroy(),
      setTime: (seconds) => instance?.setTime(seconds),
      setClock: (clock) => instance?.setClock(clock),
      setResolution: (resolution) => instance?.setResolution(resolution),
      captureFrame: <F extends CaptureFormat = "png">(options?: CaptureOptions<F>) =>
        instance
          ? instance.captureFrame(options)
          : Promise.reject(new Error("No particles instance is mounted.")),
      reset: () => instance?.reset(),
      setUniform: (name, value) => instance?.setUniform(name, value),
      setUniforms: (values) => instance?.setUniforms(values),
      bindUniforms: (source) => instance?.bindUniforms(source) ?? noop,
      setColor: (color) => instance?.setColor(color),
      setPalette: (palette) => instance?.setPalette(palette),
      setBlend: (blend) => instance?.setBlend(blend)
    }),
    [instance]
  );

  const mergedStyle = useMemo(
    () => ({
      ...(className ? undefined : defaultStyle),
      ...style
    }),
    [className, style]
  );

  return (
    <div
      aria-hidden="true"
      {...(domEntries as HTMLAttributes<HTMLDivElement>)}
      ref={ref}
      className={className}
      style={mergedStyle}
    />
  );
});

Particles.displayName = "Particles";
