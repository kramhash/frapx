import {
  createShaderBackground,
  type CreateShaderBackgroundOptions,
  type RenderState,
  type ShaderBackgroundInstance,
  type ShaderStatus,
  type TextureMap,
  type UniformInputMap,
  type UniformSource
} from "@frapx/fx-canvas";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "./internal/useLatestRef";
import { omitUndefined } from "./internal/omitUndefined";
import {
  bindSources,
  unbindSources,
  useStableSources,
  type BoundSources
} from "./internal/uniformSources";

// onStatusChange is held back until the hook tracks `status` with it (#68).
export type UseShaderBackgroundOptions<
  TUniforms extends UniformInputMap = UniformInputMap
> = Omit<
  CreateShaderBackgroundOptions<TUniforms>,
  "target" | "onReady" | "onError" | "onStatusChange"
> & {
  onShaderReady?: (instance: ShaderBackgroundInstance<TUniforms>) => void;
  onShaderError?: (error: Error) => void;
  /**
   * Bound with `bindUniforms()` in order, so a later source wins for the same
   * uniform. Sources are compared by identity: changing the array's contents
   * rebinds, and a recreated instance is bound again.
   */
  uniformSources?: readonly UniformSource[] | undefined;
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
  const lastFragmentRef = useRef<string | undefined>(undefined);
  const boundSourcesRef = useRef<BoundSources | null>(null);
  // Bumped to recreate an instance whose first shader failed, which cannot
  // swap shaders in place.
  const [generation, setGeneration] = useState(0);
  const latestOptionsRef = useLatestRef(options);
  const uniformSources = useStableSources(options.uniformSources);
  const stableSourcesRef = useLatestRef(uniformSources);

  const ref = useCallback((node: HTMLElement | null) => {
    setTarget(node);
  }, []);

  // The instance gets a stable wrapper that calls the latest source, so an
  // inline function neither recreates it nor restarts u_delta every render.
  const readTimeSource = useCallback(
    () => latestOptionsRef.current.timeSource?.() ?? Number.NaN,
    [latestOptionsRef]
  );

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
      onResize,
      uniforms,
      textures,
      uniformSources,
      timeSource,
      ...rest
    } = latest;

    const createOptions = omitUndefined({
      ...rest,
      target,
      timeSource: timeSource && readTimeSource,
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
      },
      onResize(state: RenderState<TUniforms>) {
        latestOptionsRef.current.onResize?.(state);
      }
    } as Record<string, unknown>) as CreateShaderBackgroundOptions<TUniforms>;

    const fx = createShaderBackground<TUniforms>(createOptions);

    instanceRef.current = fx;
    lastUniformsRef.current = uniforms;
    lastTexturesRef.current = textures;
    lastFragmentRef.current = latest.fragment;
    // Bound before the first frame, not after the re-render that sets `instance`.
    boundSourcesRef.current = bindSources(fx, stableSourcesRef.current);
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
        boundSourcesRef.current = null;
        lastUniformsRef.current = undefined;
        lastTexturesRef.current = undefined;
        lastFragmentRef.current = undefined;
        setInstance(null);
        setStatus("destroyed");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, generation, ...recreateDeps]);

  // A new fragment swaps in place, keeping time, uniforms and feedback. A
  // compile error reaches `error` through onError and the old shader keeps
  // drawing.
  useEffect(() => {
    const fragment = options.fragment;
    const fx = instanceRef.current;
    if (!fx || lastFragmentRef.current === fragment) return;
    lastFragmentRef.current = fragment;
    if (fx.status === "error") {
      setGeneration((current) => current + 1);
      return;
    }
    // null also means "kept for later" before initialization or while the
    // context is lost; only a swap on a working instance clears the error.
    if (!fx.setFragment(fragment) && SWAPPABLE.has(fx.status)) setError(null);
  }, [options.fragment]);

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

  // A changed source list rebinds in order on the existing instance.
  useEffect(() => {
    const fx = instanceRef.current;
    if (!fx || boundSourcesRef.current?.sources === uniformSources) return;
    unbindSources(boundSourcesRef.current);
    boundSourcesRef.current = bindSources(fx, uniformSources);
  }, [uniformSources]);

  // clock and resolution switch in place instead of recreating the instance.
  const clock = options.clock ?? "realtime";
  useEffect(() => {
    instanceRef.current?.setClock(clock);
  }, [clock]);

  const hasTimeSource = options.timeSource !== undefined;
  useEffect(() => {
    instanceRef.current?.setTimeSource(hasTimeSource ? readTimeSource : null);
  }, [hasTimeSource, readTimeSource]);

  // Compared by value so an inline array literal does not re-apply every render.
  const resolutionKey = options.resolution
    ? `${options.resolution[0]}x${options.resolution[1]}`
    : null;
  useEffect(() => {
    const fx = instanceRef.current;
    if (!fx) return;
    try {
      fx.setResolution(latestOptionsRef.current.resolution ?? null);
    } catch (nextError) {
      setError(toError(nextError));
    }
  }, [resolutionKey]);

  return { ref, instance, status, error };
};

const SWAPPABLE = new Set<ShaderStatus>(["ready", "running", "paused"]);

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));
