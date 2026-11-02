import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAnalytics, measurementId, resetAnalyticsForTests, track } from "./analytics";

describe("measurementId", () => {
  it("is set only for production builds with a well-formed ID", () => {
    expect(measurementId({ PROD: true, VITE_GA_MEASUREMENT_ID: "G-ABC123XYZ" })).toBe("G-ABC123XYZ");
    expect(measurementId({ PROD: false, VITE_GA_MEASUREMENT_ID: "G-ABC123XYZ" })).toBeNull();
    expect(measurementId({ PROD: true })).toBeNull();
    expect(measurementId({ PROD: true, VITE_GA_MEASUREMENT_ID: "" })).toBeNull();
    expect(measurementId({ PROD: true, VITE_GA_MEASUREMENT_ID: "UA-123-1" })).toBeNull();
    expect(measurementId({ PROD: true, VITE_GA_MEASUREMENT_ID: 'G-1"><script>' })).toBeNull();
  });
});

describe("initAnalytics and track", () => {
  const appended: { src: string }[] = [];

  beforeEach(() => {
    resetAnalyticsForTests();
    appended.length = 0;
    vi.stubGlobal("window", {
      location: { origin: "https://kramhash.github.io", pathname: "/frapx/playground/", hash: "#v1=secret" }
    });
    vi.stubGlobal("document", {
      title: "Playground — frapx",
      createElement: () => ({ async: false, src: "" }),
      head: { append: (element: { src: string }) => appended.push(element) }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAnalyticsForTests();
  });

  const calls = () =>
    (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));

  it("does nothing without an ID", () => {
    initAnalytics(null);
    track({ name: "share_url_copy", params: {} });
    expect(window.dataLayer).toBeUndefined();
    expect(appended).toHaveLength(0);
  });

  it("sends one page view without the hash, then events", () => {
    initAnalytics("G-TEST1234");
    track({ name: "install_code_copy", params: { tab: "react" } });
    track({ name: "volume_open", params: { source: "file" } });

    expect(appended.map((element) => element.src)).toEqual([
      "https://www.googletagmanager.com/gtag/js?id=G-TEST1234"
    ]);
    const sent = calls();
    expect(sent[1]).toEqual(["config", "G-TEST1234", { send_page_view: false }]);
    expect(sent[2]).toEqual([
      "event",
      "page_view",
      { page_location: "https://kramhash.github.io/frapx/playground/", page_title: "Playground — frapx" }
    ]);
    expect(sent.slice(3)).toEqual([
      ["event", "install_code_copy", { tab: "react" }],
      ["event", "volume_open", { source: "file" }]
    ]);
    expect(JSON.stringify(sent)).not.toContain("secret");
  });

  it("initializes once", () => {
    initAnalytics("G-TEST1234");
    initAnalytics("G-TEST1234");
    expect(appended).toHaveLength(1);
  });
});
