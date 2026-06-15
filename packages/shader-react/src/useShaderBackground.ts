import {
  createShaderBackground,
  type CreateShaderBackgroundOptions,
  type RenderState,
  type ShaderBackgroundInstance,
  type ShaderStatus,
  type TextureMap,
  type UniformInputMap
} from "@frapx/shader";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "./internal/useLatestRef";
import { omitUndefined } from "./internal/omitUndefined";

export type UseShaderBackgroundOptions<
  TUniforms extends UniformInputMap = UniformInputMap
> = Omit<CreateShaderBackgroundOptions<TUniforms>, "target" | "onReady" | "onError"> & {
  onShaderReady?: (instance: ShaderBackgroundInstance<TUniforms>) => void;
  onShaderError?: (error: Error) => void;
};

export type UseShaderBackgroundResult<
  TUniforms extends UniformInputMap = UniformInputMap
> = {
  ref: (node: HTMLElement | null) => void;
  instance: ShaderBackgroundInstance<TUniforms> | null;
  status: ShaderStatus;
  error: Error | null;
};

export const useShaderBackground = <
  TUniforms extends UniformInputMap = UniformInputMap
>(
  options: UseShaderBackgroundOptions<TUniforms>,
  recreateDeps: readonly unknown[] = []
): UseShaderBackgroundResult<TUniforms> => {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [instance, setInstance] =
    useState<ShaderBackgroundInstance<TUniforms> | null>(null);
  const [status, setStatus] = useState<ShaderStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const instanceRef = useRef<ShaderBackgroundInstance<TUniforms> | null>(null);
  const mountedRef = useRef(false);
  const lastUniformsRef = useRef<TUniforms | undefined>(undefined);
  const lastTexturesRef = useRef<TextureMap | undefined>(undefined);
  const latestOptionsRef = useLatestRef(options);

  const ref = useCallback((node: HTMLElement | null) => {
    setTarget(node);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!target) return;

    let disposed = false;
    const latest = latestOptionsRef.current;
    const {
      onShaderReady,
      onShaderError,
      onBeforeRender,
      onAfterRender,
      uniforms,
      textures,
      ...rest
    } = latest;

    const createOptions = omitUndefined({
      ...rest,
      target,
      uniforms,
      textures,
      onReady(readyInstance: ShaderBackgroundInstance<TUniforms>) {
        if (disposed || !mountedRef.current) return;
        setStatus(readyInstance.status);
        onShaderReady?.(readyInstance);
      },
      onError(nextError: Error) {
        if (disposed || !mountedRef.current) return;
        setError(nextError);
        setStatus(instanceRef.current?.status ?? "error");
        onShaderError?.(nextError);
      },
      onBeforeRender(state: RenderState<TUniforms>) {
        latestOptionsRef.current.onBeforeRender?.(state);
      },
      onAfterRender(state: RenderState<TUniforms>) {
        latestOptionsRef.current.onAfterRender?.(state);
      }
    } as Record<string, unknown>) as CreateShaderBackgroundOptions<TUniforms>;

    const fx = createShaderBackground<TUniforms>(createOptions);

    instanceRef.current = fx;
    lastUniformsRef.current = uniforms;
    lastTexturesRef.current = textures;
    setInstance(fx);
    setStatus(fx.status);
    setError(null);

    void fx.ready.then(
      () => {
        if (disposed || !mountedRef.current) return;
        setStatus(fx.status);
      },
      (nextError: unknown) => {
        if (disposed || !mountedRef.current) return;
        setError(toError(nextError));
        setStatus(fx.status);
      }
    );

    return () => {
      disposed = true;
      fx.destroy();
      if (instanceRef.current === fx) {
        instanceRef.current = null;
        lastUniformsRef.current = undefined;
        lastTexturesRef.current = undefined;
        setInstance(null);
        setStatus("destroyed");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ...recreateDeps]);

  useEffect(() => {
    const uniforms = options.uniforms;
    const fx = instanceRef.current;
    if (!fx || !uniforms || lastUniformsRef.current === uniforms) return;

    lastUniformsRef.current = uniforms;
    fx.setUniforms(uniforms);
    setStatus(fx.status);
  }, [options.uniforms]);

  useEffect(() => {
    const textures = options.textures;
    const fx = instanceRef.current;
    if (!fx || !textures || lastTexturesRef.current === textures) return;

    lastTexturesRef.current = textures;
    void fx.setTextures(textures).then(
      () => {
        if (!mountedRef.current || instanceRef.current !== fx) return;
        setStatus(fx.status);
      },
      (nextError: unknown) => {
        if (!mountedRef.current || instanceRef.current !== fx) return;
        setError(toError(nextError));
        setStatus(fx.status);
      }
    );
  }, [options.textures]);

  return { ref, instance, status, error };
};

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));
