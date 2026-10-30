import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Shaders are compiled on a blank page, so no web server is needed.
  workers: 1
});
