/**
 * GA4 for the playground (growth plan decision 41). Production builds with a
 * measurement ID only; everything here is a no-op otherwise, and a blocked
 * gtag script never breaks the page. Nothing the visitor wrote (shader
 * source, file names, uniform values, the share hash) is ever sent.
 */

export type AnalyticsEvent =
  | { readonly name: "install_code_copy"; readonly params: { readonly tab: string } }
  | { readonly name: "share_url_copy"; readonly params: Record<string, never> }
  | { readonly name: "starter_select"; readonly params: { readonly starter: string } }
  | { readonly name: "volume_open"; readonly params: { readonly source: "sample" | "file" } };

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;

/**
 * The browser's own replaceState, taken when this module loads, before gtag.
 * gtag wraps history.replaceState to report "page changes"; with GA's
 * enhanced measurement on, every share-hash write would then send a page view
 * whose URL holds the shader. Writing the hash through this one bypasses the
 * wrapper, whatever the GA admin settings are.
 */
const nativeReplaceState: History["replaceState"] | null =
  typeof History === "undefined" ? null : History.prototype.replaceState;

/** Replaces the URL without going through analytics' history hooks. */
export const replaceStateQuietly = (url: string): void => {
  if (nativeReplaceState === null) return;
  nativeReplaceState.call(window.history, window.history.state, "", url);
};

/** The measurement ID to use, or null when this build must not measure. */
export const measurementId = (
  env: { readonly PROD: boolean; readonly VITE_GA_MEASUREMENT_ID?: string | undefined } = import.meta.env
): string | null => {
  const id = env.VITE_GA_MEASUREMENT_ID?.trim();
  return env.PROD && id !== undefined && MEASUREMENT_ID.test(id) ? id : null;
};

let gtag: Gtag | null = null;

/**
 * Loads gtag and sends one page view without the hash (the share hash holds
 * the shader). Call once at startup.
 */
export const initAnalytics = (id: string | null = measurementId()): void => {
  if (id === null || gtag !== null || typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  const dataLayer = window.dataLayer;
  // gtag.js reads `arguments` objects from dataLayer, not arrays.
  const push: Gtag = function (this: unknown) {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  window.gtag = push;
  gtag = push;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.append(script);

  push("js", new Date());
  push("config", id, { send_page_view: false });
  push("event", "page_view", {
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_title: document.title
  });
};

/** Sends one event; does nothing when analytics is off. */
export const track = (event: AnalyticsEvent): void => {
  gtag?.("event", event.name, { ...event.params });
};

/** For tests: forget the loaded gtag. */
export const resetAnalyticsForTests = (): void => {
  gtag = null;
};
