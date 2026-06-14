import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/glsl.ts", "src/color.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false
});
