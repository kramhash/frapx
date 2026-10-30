import {
  createParticles,
  type CreateParticlesOptions,
  type ParticleUniformName,
  type ParticlesInstance,
  type ShaderStatus,
  type UniformInput,
  type UniformSource
} from "@frapx/fx-particles";
import { useCallback, useEffect, useRef, useState } from "react";
import { deepEqual, useDeepStable } from "./internal/equal";
import { omitUndefined } from "./internal/omitUndefined";
import {
  dropsValue,
  liveValuesOf,
  outgrowsPool,
  structureOf,
  type LiveValues
} from "./internal/options";
import {
  bindSources,
  unbindSources,
  useStableSources,
  type BoundSources
} from "./internal/uniformSources";
import { useLatestRef } from "./internal/useLatestRef";

export type UseParticlesOptions = Omit<
  CreateParticlesOptions,
  "target" | "onReady" | "onError"
> & {
  onParticlesReady?: (instance: ParticlesInstance) => void;
  onParticlesError?: (error: Error) => void;
  /**
   * Bound with `bindUniforms()` in order, so a later source wins for the same
   * uniform. Sources are compared by identity: changing the array's contents
   * rebinds, and a recreated instance is bound again.
   */
  uniformSources?: readonly UniformSource[] | undefined;
};

export type UseParticlesResult = {
  ref: (node: HTMLElement | null) => void;
  instance: ParticlesInstance | null;
  status: ShaderStatus;
  error: Error | null;
};

/**
 * Options are compared by value. Uniform-backed values (`rate`, `opacity`,
 * force strengths…), `color`, `palette`, `blend`, `clock`, `timeSource` and
 * `resolution` change in place; any other change, dropping one of those values, or a
 * `rate` that outgrows the automatic pool recreates the instance.
 */
export const useParticles = (
  options: UseParticlesOptions,
  recreateDeps: readonly unknown[] = []
): UseParticlesResult => {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [instance, setInstance] = useState<ParticlesInstance | null>(null);
  const [status, setStatus] = useState<ShaderStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const instanceRef = useRef<ParticlesInstance | null>(null);
  const mountedRef = useRef(false);
  // The live values the current instance shows.
  const appliedRef = useRef<LiveValues | null>(null);
  const boundSourcesRef = useRef<BoundSources | null>(null);
  // The live values of a creation that threw, so a later live change retries it.
  const failedLiveRef = useRef<LiveValues | null>(null);
  // The error a live change raised, cleared by the next one that applies.
  const liveErrorRef = useRef<Error | null>(null);
  // Bumped to recreate when a live change cannot apply in place.
  const [generation, setGeneration] = useState(0);
  const latestOptionsRef = useLatestRef(options);

  const structure = useDeepStable(structureOf(options));
  const live = useDeepStable(liveValuesOf(options));
  const liveRef = useLatestRef(live);
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
    const rest: Record<string, unknown> = { ...latestOptionsRef.current };
    delete rest.onParticlesReady;
    delete rest.onParticlesError;
    delete rest.onStatusChange;
    delete rest.uniformSources;
    if (rest.timeSource) rest.timeSource = readTimeSource;

    let fx: ParticlesInstance;
    try {
      fx = createParticles(
        omitUndefined({
          ...rest,
          target,
          onReady(readyInstance: ParticlesInstance) {
            if (disposed || !mountedRef.current) return;
            latestOptionsRef.current.onParticlesReady?.(readyInstance);
          },
          onError(nextError: Error) {
            if (disposed || !mountedRef.current) return;
            setError(nextError);
            latestOptionsRef.current.onParticlesError?.(nextError);
          },
          onStatusChange(nextStatus: ShaderStatus) {
            if (!disposed && mountedRef.current) setStatus(nextStatus);
            latestOptionsRef.current.onStatusChange?.(nextStatus);
          }
        }) as CreateParticlesOptions
      );
    } catch (nextError) {
      // An invalid config throws before any instance exists.
      const failure = toError(nextError);
      failedLiveRef.current = liveRef.current;
      setError(failure);
      setStatus("error");
      latestOptionsRef.current.onParticlesError?.(failure);
      return;
    }
    failedLiveRef.current = null;
    instanceRef.current = fx;
    appliedRef.current = liveRef.current;
    // Bound before the first frame, not after the re-render that sets `instance`.
    boundSourcesRef.current = bindSources(fx, stableSourcesRef.current);
    setInstance(fx);
    setStatus(fx.status);
    setError(null);

    void fx.ready.catch((nextError: unknown) => {
      if (disposed || !mountedRef.current) return;
      setError(toError(nextError));
    });

    return () => {
      disposed = true;
      fx.destroy();
      if (instanceRef.current === fx) {
        instanceRef.current = null;
        appliedRef.current = null;
        boundSourcesRef.current = null;
        setInstance(null);
        setStatus("destroyed");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, generation, structure, ...recreateDeps]);

  // Live values apply in place, or recreate when the instance cannot take them.
  useEffect(() => {
    const fx = instanceRef.current;
    const applied = appliedRef.current;
    if (!fx || !applied) {
      // Retry a failed creation only for values it has not already seen, not
      // in the commit whose creation just failed.
      const failed = failedLiveRef.current;
      if (failed && failed !== live) setGeneration((current) => current + 1);
      return;
    }
    if (applied === live) return;

    if (
      dropsValue(applied, live) ||
      outgrowsPool(latestOptionsRef.current, live.uniforms.rate, fx.maxParticles)
    ) {
      setGeneration((current) => current + 1);
      return;
    }

    // Each value counts as applied only once its setter succeeds, so a value
    // that threw (an invalid color) is retried and the others still apply.
    const shown: LiveValues = { ...applied, uniforms: { ...applied.uniforms } };
    let failure = null as Error | null;
    const attempt = (apply: () => void) => {
      try {
        apply();
      } catch (nextError) {
        failure ??= toError(nextError);
      }
    };

    const changed: Partial<Record<ParticleUniformName, UniformInput>> = {};
    for (const [name, value] of Object.entries(live.uniforms)) {
      const key = name as ParticleUniformName;
      if (!deepEqual(applied.uniforms[key], value)) changed[key] = value;
    }
    attempt(() => {
      fx.setUniforms(changed);
      shown.uniforms = live.uniforms;
    });
    const { color, palette, blend } = live;
    if (color !== undefined && !deepEqual(applied.color, color)) {
      attempt(() => {
        fx.setColor(color);
        shown.color = color;
      });
    }
    if (palette !== undefined && !deepEqual(applied.palette, palette)) {
      attempt(() => {
        fx.setPalette(palette);
        shown.palette = palette;
      });
    }
    if (blend !== undefined && applied.blend !== blend) {
      attempt(() => {
        fx.setBlend(blend);
        shown.blend = blend;
      });
    }

    if (failure) {
      appliedRef.current = shown;
      liveErrorRef.current = failure;
      setError(failure);
      return;
    }
    appliedRef.current = live;
    const cleared = liveErrorRef.current;
    liveErrorRef.current = null;
    if (cleared) setError((current) => (current === cleared ? null : current));
  }, [live]);

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

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));
