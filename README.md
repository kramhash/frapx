# frapx

Web graphics utilities for building lightweight visual effects on the web.

## Packages

- [`@frapx/shader`](./packages/shader) - Create lightweight WebGL shader backgrounds for websites.

## Architecture

`@frapx/shader` is the lightweight core runtime. Optional capabilities such as SDF helpers, noise utilities, and presets should live in separate packages so the core package stays small and focused.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Examples

```sh
pnpm dev
```
