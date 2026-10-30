import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Resolve the workspace packages to source so the example reflects edits
// without a rebuild.
const source = (name: string) => ({
  find: new RegExp(`^@frapx/${name}$`),
  replacement: resolve(__dirname, `../../packages/${name}/src/index.ts`)
});

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      source("core"),
      source("fx-canvas"),
      source("fx-particles"),
      source("glsl-noise"),
      source("glsl-sdf-volume"),
      source("react-canvas"),
      source("react-particles")
    ]
  }
});
