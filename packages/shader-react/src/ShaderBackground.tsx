import {
  type ShaderBackgroundInstance,
  type TextureInput,
  type UniformInput,
  type UniformInputMap,
  type UniformRuntimeValue
} from "@frapx/shader";
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
  setTexture(name: string, input: TextureInput): Promise<void>;
  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>
  ): void;
  setUniform(name: string, value: UniformInput): void;
};

export type ShaderBackgroundProps<
  TUniforms extends UniformInputMap = UniformInputMap
> = UseShaderBackgroundOptions<TUniforms> &
  Omit<HTMLAttributes<HTMLDivElement>, keyof UseShaderBackgroundOptions<TUniforms> | "children"> & {
    recreateKey?: unknown;
  };

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
  const {
    recreateKey,
    className,
    style,
    fragment,
    vertex,
    uniforms,
    textures,
    renderMode,
    canvasClass,
    canvasStyle,
    layer,
    autoStart,
    pauseWhenOffscreen,
    dpr,
    maxDpr,
    autoResize,
    debug,
    onShaderReady,
    onShaderError,
    onBeforeRender,
    onAfterRender,
    ...domProps
  } = props;

  const options = omitUndefined({
    fragment,
    vertex,
    uniforms,
    textures,
    renderMode,
    canvasClass,
    canvasStyle,
    layer,
    autoStart,
    pauseWhenOffscreen,
    dpr,
    maxDpr,
    autoResize,
    debug,
    onShaderReady,
    onShaderError,
    onBeforeRender,
    onAfterRender
  }) as UseShaderBackgroundOptions<TUniforms>;

  const { ref, instance } = useShaderBackground(options, [
    fragment,
    vertex,
    renderMode,
    canvasClass,
    canvasStyle,
    layer,
    autoStart,
    pauseWhenOffscreen,
    dpr,
    maxDpr,
    autoResize,
    debug,
    recreateKey
  ]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      getInstance: () => instance,
      start: () => instance?.start(),
      stop: () => instance?.stop(),
      render: () => instance?.render(),
      resize: () => instance?.resize(),
      destroy: () => instance?.destroy(),
      setTexture: (name, input) =>
        instance?.setTexture(name, input) ?? Promise.resolve(),
      setUniform: (name: string, value: UniformInput) => {
        instance?.setUniform(name, value);
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
      {...domProps}
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
