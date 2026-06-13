import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@frapx/shader": resolve(__dirname, "../../packages/shader/src/index.ts"),
      "@frapx/shader/glsl": resolve(__dirname, "../../packages/shader/src/glsl.ts")
    }
  }
});
