import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Each test spins up its own WebGL context; running them in parallel can
  // exhaust the headless GPU and trigger spurious context-lost failures.
  workers: 1,
  webServer: {
    command: "pnpm --dir ../../examples/vite-basic dev --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:5174"
  }
});
