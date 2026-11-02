import { useEffect, useRef, useState } from "react";
import { decodeShare, encodeShare } from "../lib/share";
import type { SharedState } from "../lib/share";

// Slider drags change the state every frame; Safari throws after 100
// replaceState calls in 10 s, so writes wait for a pause.
const WRITE_DELAY = 300;

/**
 * Restores the state in the URL hash on load and whenever the hash is
 * changed from outside (a share URL pasted into this tab), and otherwise
 * keeps the hash in sync with `state` through replaceState (no history
 * entries). `state` is null while it is not settled (e.g. an edit still
 * debouncing), so a half-applied state never overwrites the hash.
 */
export function useShareHash(
  state: SharedState | null,
  onRestore: (shared: SharedState) => void,
  onUnreadable: () => void
): void {
  const [restored, setRestored] = useState(false);
  const onRestoreRef = useRef(onRestore);
  const onUnreadableRef = useRef(onUnreadable);
  // The hash this hook wrote last, so its own writes are not read back.
  const written = useRef<string | null>(null);

  useEffect(() => {
    onRestoreRef.current = onRestore;
    onUnreadableRef.current = onUnreadable;
  }, [onRestore, onUnreadable]);

  useEffect(() => {
    let cancelled = false;
    const read = () => {
      const hash = window.location.hash;
      if (hash === written.current) return;
      void decodeShare(hash).then((shared) => {
        if (cancelled || window.location.hash !== hash) return;
        if (shared instanceof Error) onUnreadableRef.current();
        else if (shared !== null) onRestoreRef.current(shared);
        setRestored(true);
      });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", read);
    };
  }, []);

  useEffect(() => {
    if (!restored || state === null) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      void encodeShare(state).then((hash) => {
        if (cancelled || hash === window.location.hash) return;
        try {
          window.history.replaceState(window.history.state, "", hash);
          written.current = hash;
        } catch {
          // Rate-limited or blocked: the next settled change tries again.
        }
      });
    }, WRITE_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [restored, state]);
}
