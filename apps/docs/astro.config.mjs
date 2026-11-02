// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Deployed at https://kramhash.github.io/frapx/ (GitHub Pages project site).
// The playground and flowmap-painter apps are built separately and copied
// into dist/playground/ and dist/tools/flowmap-painter/ by
// .github/workflows/pages.yml, so they live under this same base.
// GA4 (growth plan decision 41): only when the Pages build passes the
// repository variable GA_MEASUREMENT_ID, so forks and local builds never
// measure. See src/content/docs/privacy.mdx.
const gaId = process.env.PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
const analyticsHead = /^G-[A-Z0-9]{4,20}$/.test(gaId)
  ? [
      {
        tag: /** @type {const} */ ("script"),
        attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${gaId}` }
      },
      {
        tag: /** @type {const} */ ("script"),
        content: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${gaId}");`
      }
    ]
  : [];

export default defineConfig({
  site: "https://kramhash.github.io",
  base: "/frapx",
  integrations: [
    starlight({
      title: "frapx",
      // Originals live in assets/brand (not MIT-licensed, see README).
      logo: {
        light: "./src/assets/frapx-logo-light.svg",
        dark: "./src/assets/frapx-logo-dark.svg",
        alt: "frapx",
        replacesTitle: true,
      },
      description:
        "Web graphics utilities for building lightweight visual effects on the web.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/kramhash/frapx",
        },
      ],
      routeMiddleware: "./src/routeData.ts",
      head: analyticsHead,
      components: {
        Footer: "./src/components/Footer.astro",
      },
      sidebar: [
        { label: "Getting Started", slug: "getting-started" },
        {
          label: "はじめに（日本語）",
          slug: "ja/getting-started",
          attrs: { lang: "ja" },
        },
        {
          label: "Packages",
          items: [
            { label: "@frapx/fx-canvas", slug: "packages/fx-canvas" },
            { label: "@frapx/fx-passes", slug: "packages/fx-passes" },
            { label: "@frapx/fx-particles", slug: "packages/fx-particles" },
            { label: "@frapx/react-canvas", slug: "packages/react-canvas" },
            {
              label: "@frapx/react-particles",
              slug: "packages/react-particles",
            },
            { label: "@frapx/glsl-noise", slug: "packages/glsl-noise" },
            { label: "@frapx/glsl-flowmap", slug: "packages/glsl-flowmap" },
            { label: "@frapx/glsl-sdf", slug: "packages/glsl-sdf" },
            { label: "@frapx/glsl-raymarch", slug: "packages/glsl-raymarch" },
            {
              label: "@frapx/glsl-sdf-volume",
              slug: "packages/glsl-sdf-volume",
            },
            { label: "@frapx/tool-capture", slug: "packages/tool-capture" },
            { label: "@frapx/tool-render", slug: "packages/tool-render" },
            { label: "@frapx/tool-dev", slug: "packages/tool-dev" },
            { label: "@frapx/core", slug: "packages/core" },
          ],
        },
        { label: "Playground", link: "/playground/" },
        { label: "Live Demo", slug: "live-demo" },
        { label: "Showcase", slug: "showcase" },
        { label: "Migration guide", slug: "migration" },
      ],
    }),
  ],
});
