import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
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
