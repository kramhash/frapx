import {
  type CaptureFormat,
  type CaptureOptions,
  type CaptureResult,
  type ClockMode,
  type ShaderCompileError,
  type Resolution,
  type ShaderBackgroundInstance,
  type TextureInput,
  type TextureMap,
  type TimeSource,
  type UniformInput,
  type UniformInputMap,
  type UniformRuntimeValue,
  type UniformSource
} from "@frapx/fx-canvas";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes
} from "react";
import { omitUndefined } from "./internal/omitUndefined";
import {
  useShaderBackground,
  type UseShaderBackgroundOptions
} from "./useShaderBackground";

export type ShaderBackgroundHandle<
  TUniforms extends UniformInputMap = UniformInputMap
> = {
  getInstance(): ShaderBackgroundInstance<TUniforms> | null;
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
  setTime(seconds: number): void;
  setClock(clock: ClockMode): void;
  /**
   * Overrides the `timeSource` prop on the current instance until the prop is
   * added or removed, or the instance is recreated. Swapping one prop function
   * for another does not undo it: the instance reads the prop through a
   * stable wrapper.
   */
  setTimeSource(source: TimeSource | null): void;
  /**
   * Swaps the fragment shader on the current instance; the `fragment` prop
   * wins again when it changes. Returns the compile error, or `null` (also
   * while no instance is mounted). A compile error still reaches `onError`,
   * but a successful swap here does not clear an earlier error; only a
   * `fragment` prop change does.
   */
  setFragment(fragment: string): ShaderCompileError | null;
  setResolution(resolution: Resolution | null): void;
  /** Rejects while no instance is mounted. */
  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>>;
  resetFeedback(): void;
  /**
   * Binds one more source on the current instance; it is not rebound if the
   * instance is recreated (use the `uniformSources` prop for that). Returns
   * the removal function, a no-op while no instance is mounted.
   */
  bindUniforms(source: UniformSource): () => void;
  setTexture(name: string, input: TextureInput): Promise<void>;
  setTextures(values: TextureMap): Promise<void>;
  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>
  ): void;
  setUniform(name: string, value: UniformInput): void;
  setUniforms(values: Record<string, UniformInput>): void;
};

export type ShaderBackgroundProps<
  TUniforms extends UniformInputMap = UniformInputMap
> = UseShaderBackgroundOptions<TUniforms> &
  Omit<HTMLAttributes<HTMLDivElement>, keyof UseShaderBackgroundOptions<TUniforms> | "children"> & {
    recreateKey?: unknown;
  };

// All keys of UseShaderBackgroundOptions. The `satisfies` check prevents typos;
// _assertComplete below catches omissions. Add here whenever core adds options.
const OPTION_KEYS = [
  "canvas",
  "fragment",
  "vertex",
  "uniforms",
  "textures",
  "feedback",
  "layer",
  "autoStart",
  "pauseWhenOffscreen",
  "pauseWhenHidden",
  "respectReducedMotion",
  "renderMode",
  "clock",
  "timeSource",
  "resolution",
  "dpr",
  "maxDpr",
  "autoResize",
  "debug",
  "canvasClass",
  "canvasStyle",
  "onBeforeRender",
  "onAfterRender",
  "onResize",
  "onStatusChange",
  "onShaderReady",
  "onShaderError",
  "uniformSources",
] as const satisfies readonly (keyof UseShaderBackgroundOptions)[];

// Fails to compile if any UseShaderBackgroundOptions key is absent from OPTION_KEYS.
type _MissingOptionKey = Exclude<keyof UseShaderBackgroundOptions, (typeof OPTION_KEYS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertComplete: _MissingOptionKey extends never ? true : never = true;

const OPTION_KEY_SET = new Set<string>(OPTION_KEYS);

const noop = (): void => {};

const defaultStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden"
};

const ShaderBackgroundInner = <
  TUniforms extends UniformInputMap = UniformInputMap
>(
  props: ShaderBackgroundProps<TUniforms>,
  forwardedRef: ForwardedRef<ShaderBackgroundHandle<TUniforms>>
) => {
  // Cast to record for key-based picking; correctness is enforced structurally
  // by OPTION_KEYS (satisfies) + _assertComplete above.
  const propsRecord = props as Record<string, unknown>;

  const { recreateKey, className, style } = props;

  // Pick shader options by OPTION_KEYS — prevents option values from leaking
  // as unknown DOM attributes on the wrapper div.
  const optionEntries: Record<string, unknown> = {};
  for (const key of OPTION_KEYS) {
    if (key in propsRecord) optionEntries[key] = propsRecord[key];
  }
  const options = omitUndefined(optionEntries) as UseShaderBackgroundOptions<TUniforms>;

  // DOM-safe attributes: everything that is not a shader option or component key.
  const domEntries: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(propsRecord)) {
    if (!OPTION_KEY_SET.has(k) && k !== "recreateKey" && k !== "className" && k !== "style") {
      domEntries[k] = v;
    }
  }

  // The hook compares the options that need a new instance by value;
  // recreateKey forces one regardless.
  const { ref, instance } = useShaderBackground(options, [recreateKey]);

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
      setTimeSource: (source) => instance?.setTimeSource(source),
      setFragment: (fragment) => instance?.setFragment(fragment) ?? null,
      setResolution: (resolution) => instance?.setResolution(resolution),
      captureFrame: <F extends CaptureFormat = "png">(
        options?: CaptureOptions<F>
      ) =>
        instance
          ? instance.captureFrame(options)
          : Promise.reject(new Error("No shader instance is mounted.")),
      resetFeedback: () => instance?.resetFeedback(),
      bindUniforms: (source) => instance?.bindUniforms(source) ?? noop,
      setTexture: (name, input) =>
        instance?.setTexture(name, input) ?? Promise.resolve(),
      setTextures: (values) =>
        instance?.setTextures(values) ?? Promise.resolve(),
      setUniform: (name: string, value: UniformInput) => {
        instance?.setUniform(name, value);
      },
      setUniforms: (values) => {
        instance?.setUniforms(values);
      }
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
};

export const ShaderBackground = forwardRef(ShaderBackgroundInner) as <
  TUniforms extends UniformInputMap = UniformInputMap
>(
  props: ShaderBackgroundProps<TUniforms> & {
    ref?: ForwardedRef<ShaderBackgroundHandle<TUniforms>>;
  }
) => import("react").ReactElement | null;
