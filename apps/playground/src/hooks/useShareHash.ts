import { useEffect, useRef, useState } from "react";
import { decodeShare, encodeShare } from "../lib/share";
import type { SharedState } from "../lib/share";

/**
 * Restores the state in the URL hash once on load, then keeps the hash in
 * sync with `state` through replaceState (no history entries). `state` is
 * null while it is not settled (e.g. an edit still debouncing), so a
 * half-applied state never overwrites the hash.
 */
export function useShareHash(
  state: SharedState | null,
  onRestore: (shared: SharedState) => void,
  onUnreadable: () => void
): void {
  const [restored, setRestored] = useState(false);
  const onRestoreRef = useRef(onRestore);
  const onUnreadableRef = useRef(onUnreadable);

  useEffect(() => {
    onRestoreRef.current = onRestore;
    onUnreadableRef.current = onUnreadable;
  }, [onRestore, onUnreadable]);

  useEffect(() => {
    let cancelled = false;
    void decodeShare(window.location.hash).then((shared) => {
      if (cancelled) return;
      if (shared instanceof Error) onUnreadableRef.current();
      else if (shared !== null) onRestoreRef.current(shared);
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored || state === null) return;
    let cancelled = false;
    void encodeShare(state).then((hash) => {
      if (cancelled || hash === window.location.hash) return;
      window.history.replaceState(window.history.state, "", hash);
    });
    return () => {
      cancelled = true;
    };
  }, [restored, state]);
}
