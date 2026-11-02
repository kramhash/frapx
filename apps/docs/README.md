# @frapx/docs

The frapx documentation site — [Astro](https://astro.build) +
[Starlight](https://starlight.astro.build). Deployed to GitHub Pages at
`https://kramhash.github.io/frapx/` alongside the
[playground](../playground) (served at `/frapx/playground/`) and the
[flowmap-painter](../flowmap-painter) tool (served at
`/frapx/tools/flowmap-painter/`) by `.github/workflows/pages.yml`.

Content lives under `src/content/docs/` as `.md`/`.mdx` files. Use `.mdx`
whenever a page imports a Starlight component (e.g. `Badge`, `Card`) —
plain `.md` does not support imports or JSX and will render them as literal
text instead of erroring, so this is easy to miss.

## Commands

Run from this directory:

```sh
pnpm dev       # local dev server at localhost:4321
pnpm build     # build to ./dist/
pnpm preview   # preview a production build locally
pnpm typecheck # astro check
```

`@frapx/fx-canvas` must already be built (`pnpm -w build` from the repo
root) before `dev`/`build` here, since the [Live Demo](src/content/docs/live-demo.mdx)
page and the package examples import the real published package rather
than an aliased source path.

## Structure

```
src/
├── components/
│   └── LiveDemo.astro       # runs the real @frapx/fx-canvas shader on the Live Demo page
├── content/
│   └── docs/
│       ├── index.mdx         # home — package decision table
│       ├── getting-started.md
│       ├── live-demo.mdx
│       ├── migration.md      # old → new package name mapping
│       └── packages/         # one page per published package
└── content.config.ts
```
