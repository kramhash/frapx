/** Package name to published version, injected by vite.config.ts. */
declare const __FRAPX_VERSIONS__: Readonly<Record<string, string>>;

interface ImportMetaEnv {
  /** GA4 measurement ID; set only for the Pages build (repository variable GA_MEASUREMENT_ID). */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}
