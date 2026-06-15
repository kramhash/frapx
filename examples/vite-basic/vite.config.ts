import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    // Resolve all @frapx/shader subpaths to source so the example reflects edits
    // without a rebuild. Wildcard avoids per-export drift (e.g. /color, /glsl).
    alias: [
      {
        find: /^@frapx\/shader$/,
        replacement: resolve(__dirname, "../../packages/shader/src/index.ts")
      },
      {
        find: /^@frapx\/shader\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/shader/src/$1.ts")
      }
    ]
  }
});
