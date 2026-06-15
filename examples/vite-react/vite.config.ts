import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@frapx\/shader$/,
        replacement: resolve(__dirname, "../../packages/shader/src/index.ts")
      },
      {
        find: /^@frapx\/shader\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/shader/src/$1.ts")
      },
      {
        find: /^@frapx\/shader-react$/,
        replacement: resolve(__dirname, "../../packages/shader-react/src/index.ts")
      }
    ]
  }
});
