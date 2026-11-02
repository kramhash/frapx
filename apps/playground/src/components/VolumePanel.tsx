import { useRef } from "react";
import type { VolumeState } from "../hooks/useVolumes";
import type { Messages } from "../lib/i18n";
import { DEFAULT_VOLUME_SAMPLE, findSample, isFileValue, VOLUME_SAMPLES } from "../lib/volumes";
import type { VolumeSlot } from "../lib/volumes";

type Props = {
  readonly states: readonly { readonly slot: VolumeSlot; readonly state: VolumeState }[];
  /** Sets the slot's `@volume` value to a sample id. */
  readonly onPickSample: (slot: VolumeSlot, id: string) => void;
  readonly onOpenFile: (slot: VolumeSlot, file: File) => void;
  /** A message about the last file that could not be opened, or null. */
  readonly fileError: string | null;
  readonly t: Messages;
};

function VolumeRow({
  slot,
  state,
  onPickSample,
  onOpenFile,
  t
}: Omit<Props, "states" | "fileError"> & { slot: VolumeSlot; state: VolumeState }) {
  const input = useRef<HTMLInputElement>(null);
  const isFile = isFileValue(slot.value);
  const note =
    state.status === "loading"
      ? t.volumeLoading
      : state.status === "error"
        ? t.volumeError(state.message)
        : state.status === "missing"
          ? t.volumeMissing(slot.value)
          : state.status === "unknown"
            ? t.unknownSample(slot.value)
            : null;

  return (
    <div className="control">
      <span className="control-name">{slot.name}</span>
      <div className="control-inputs">
        <div className="volume-pick">
          <select
            aria-label={slot.name}
            value={isFile || findSample(slot.value) ? slot.value : ""}
            onChange={(event) => onPickSample(slot, event.target.value)}
          >
            {!isFile && findSample(slot.value) === undefined && <option value="" disabled />}
            {VOLUME_SAMPLES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.label}
              </option>
            ))}
            {isFile && (
              <option value={slot.value} disabled>
                {slot.value}
              </option>
            )}
          </select>
          <button type="button" className="button" onClick={() => input.current?.click()}>
            {t.openFile}
          </button>
          <input
            ref={input}
            type="file"
            accept=".ktx2"
            hidden
            data-volume={slot.name}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) onOpenFile(slot, file);
              event.target.value = "";
            }}
          />
        </div>
        {note !== null && (
          <p className="volume-note" role={state.status === "loading" ? undefined : "status"}>
            {note}
            {(state.status === "missing" || state.status === "unknown") && (
              <button type="button" className="button" onClick={() => onPickSample(slot, DEFAULT_VOLUME_SAMPLE.id)}>
                {t.useSample(DEFAULT_VOLUME_SAMPLE.label)}
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** One row per `@volume` sampler: sample select, file picker, load state. */
export function VolumePanel({ states, onPickSample, onOpenFile, fileError, t }: Props) {
  if (states.length === 0) return null;
  return (
    <div className="controls volumes">
      {states.map(({ slot, state }) => (
        <VolumeRow key={slot.name} slot={slot} state={state} onPickSample={onPickSample} onOpenFile={onOpenFile} t={t} />
      ))}
      {fileError !== null && (
        <p className="volume-note" role="alert">
          {fileError}
        </p>
      )}
    </div>
  );
}
