import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // One WebGL preview at a time; parallel contexts can exhaust the headless GPU.
  workers: 1,
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 5190 --strictPort",
    url: "http://127.0.0.1:5190/frapx/playground/",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:5190",
    locale: "en-US"
  }
});
