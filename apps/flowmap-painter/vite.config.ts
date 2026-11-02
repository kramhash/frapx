import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Deployed under the docs site's base path — see .github/workflows/pages.yml,
  // which builds @frapx/docs and this app separately and merges this app's
  // dist/ into the docs dist/tools/flowmap-painter/ before uploading the
  // Pages artifact.
  base: "/frapx/tools/flowmap-painter/",
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@frapx\/core$/,
        replacement: resolve(__dirname, "../../packages/core/src/index.ts")
      },
      {
        find: /^@frapx\/core\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/core/src/$1.ts")
      },
      {
        find: /^@frapx\/fx-canvas$/,
        replacement: resolve(__dirname, "../../packages/fx-canvas/src/index.ts")
      },
      {
        find: /^@frapx\/fx-canvas\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/fx-canvas/src/$1.ts")
      },
      {
        find: /^@frapx\/glsl-flowmap$/,
        replacement: resolve(
          __dirname,
          "../../packages/glsl-flowmap/src/index.ts"
        )
      },
      {
        find: /^@frapx\/react-canvas$/,
        replacement: resolve(
          __dirname,
          "../../packages/react-canvas/src/index.ts"
        )
      }
    ]
  }
});
