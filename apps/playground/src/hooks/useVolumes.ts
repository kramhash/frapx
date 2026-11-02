import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSdfVolume } from "@frapx/glsl-sdf-volume";
import type { SdfVolume, SdfVolumeTexture } from "@frapx/glsl-sdf-volume";
import { decompress } from "fzstd";
import type { InstallVolume } from "../lib/codegen";
import type { UniformValues } from "../lib/uniforms";
import { findSample, isFileValue, volumeFile } from "../lib/volumes";
import type { VolumeSlot } from "../lib/volumes";

type Entry =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly volume: SdfVolume; readonly zstd: boolean }
  | { readonly status: "error"; readonly message: string };

/** What the panel shows for one `@volume` sampler. */
export type VolumeState =
  | Entry
  /** A file name nothing has loaded in this tab, e.g. from a share URL. */
  | { readonly status: "missing" }
  /** A sample id that does not exist. */
  | { readonly status: "unknown" };

export type Volumes = {
  readonly states: readonly { readonly slot: VolumeSlot; readonly state: VolumeState }[];
  readonly textures: Readonly<Record<string, SdfVolumeTexture>>;
  /** `<name>Min` / `Max` / `Scale` / `Offset` per loaded volume. */
  readonly uniforms: UniformValues;
  readonly install: readonly InstallVolume[];
  /** Loads a local file; resolves to its `@volume` value, or an Error. */
  readonly openFile: (file: File) => Promise<string | Error>;
  /** Fetches a bundled sample again after it failed. */
  readonly retry: (value: string) => void;
};

const read = async (buffer: ArrayBuffer): Promise<Entry> => {
  let zstd = false;
  try {
    const volume = await loadSdfVolume(buffer, {
      zstd: (bytes, size) => {
        zstd = true;
        return decompress(bytes, new Uint8Array(size));
      }
    });
    return { status: "ready", volume, zstd };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
};

const sampleUrl = (file: string) => `${import.meta.env.BASE_URL}sdf/${file}`;

/** `@volume` values with spaces and other characters a source line can't carry replaced. */
const toVolumeValue = (fileName: string): string => fileName.replace(/[^\p{L}\p{N}_.-]/gu, "_");

/**
 * Loads the volume each `@volume` sampler names: bundled samples from the
 * site, local files when opened. Loaded volumes are kept by value, so
 * switching back is instant and two samplers can share one.
 */
export function useVolumes(slots: readonly VolumeSlot[]): Volumes {
  const [entries, setEntries] = useState<Readonly<Record<string, Entry>>>({});
  const started = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    for (const { value } of slots) {
      const sample = findSample(value);
      if (sample === undefined || started.current.has(value)) continue;
      started.current.add(value);
      setEntries((previous) => ({ ...previous, [value]: { status: "loading" } }));
      void fetch(sampleUrl(sample.file))
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then(read, (error: unknown): Entry => ({ status: "error", message: String(error) }))
        .then((entry) => setEntries((previous) => ({ ...previous, [value]: entry })));
    }
    // `attempt` re-runs this after retry() cleared a failed sample.
  }, [slots, attempt]);

  const openFile = useCallback(async (file: File): Promise<string | Error> => {
    const value = toVolumeValue(file.name);
    if (!isFileValue(value)) return new Error("not .sdf.ktx2");
    const entry = await read(await file.arrayBuffer());
    // A file that fails to load does not replace a good volume of the same name.
    if (entry.status === "error") return new Error(entry.message);
    setEntries((previous) => ({ ...previous, [value]: entry }));
    return value;
  }, []);

  const retry = useCallback((value: string) => {
    started.current.delete(value);
    setEntries((previous) => {
      const next = { ...previous };
      delete next[value];
      return next;
    });
    setAttempt((count) => count + 1);
  }, []);

  return useMemo(() => {
    const states = slots.map((slot) => {
      const entry = entries[slot.value];
      const state: VolumeState =
        entry ?? (isFileValue(slot.value) ? { status: "missing" } : findSample(slot.value) ? { status: "loading" } : { status: "unknown" });
      return { slot, state };
    });

    const textures: Record<string, SdfVolumeTexture> = {};
    const uniforms: Record<string, readonly number[]> = {};
    const install: InstallVolume[] = [];
    for (const { slot, state } of states) {
      const ready = state.status === "ready" ? state : undefined;
      if (ready !== undefined) {
        textures[slot.name] = ready.volume.texture;
        for (const [key, value] of Object.entries(ready.volume.uniforms(slot.name))) {
          uniforms[key] = typeof value === "number" ? [value] : [...value];
        }
      }
      if (findSample(slot.value) !== undefined || isFileValue(slot.value)) {
        install.push({ name: slot.name, ...volumeFile(slot.value, ready?.zstd) });
      }
    }
    return { states, textures, uniforms, install, openFile, retry };
  }, [slots, entries, openFile, retry]);
}
