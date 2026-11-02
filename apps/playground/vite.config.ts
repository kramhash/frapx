import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Published versions for the generated install code (CDN URLs).
const versionOf = (dir: string): string => {
  const manifest: unknown = JSON.parse(
    readFileSync(resolve(__dirname, `../../packages/${dir}/package.json`), "utf8")
  );
  const version =
    typeof manifest === "object" && manifest !== null && "version" in manifest
      ? manifest.version
      : undefined;
  if (typeof version !== "string") throw new Error(`packages/${dir} has no version`);
  return version;
};

const fzstdManifest: unknown = JSON.parse(
  readFileSync(resolve(__dirname, "node_modules/fzstd/package.json"), "utf8")
);
const fzstdVersion =
  typeof fzstdManifest === "object" && fzstdManifest !== null && "version" in fzstdManifest
    ? String(fzstdManifest.version)
    : "0.1.1";

const versions = Object.fromEntries(
  ["fx-canvas", "react-canvas", "glsl-noise", "glsl-sdf", "glsl-raymarch", "glsl-sdf-volume"].map((dir) => [
    `@frapx/${dir}`,
    versionOf(dir)
  ])
);
versions["fzstd"] = fzstdVersion;

export default defineConfig({
  // Deployed under the docs site's base path — see .github/workflows/pages.yml,
  // which builds @frapx/docs and this app separately and merges this app's
  // dist/ into the docs dist/playground/ before uploading the Pages artifact.
  base: "/frapx/playground/",
  plugins: [react()],
  define: {
    __FRAPX_VERSIONS__: JSON.stringify(versions)
  },
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
      ...["glsl-noise", "glsl-sdf", "glsl-raymarch", "glsl-sdf-volume", "tool-dev"].map((name) => ({
        find: new RegExp(`^@frapx/${name}$`),
        replacement: resolve(__dirname, `../../packages/${name}/src/index.ts`)
      }))
    ]
  }
});
