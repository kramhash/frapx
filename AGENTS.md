# AGENTS.md

## Communication

- Respond in Japanese by default.
- Keep updates concise and implementation-focused.
- Before editing code, inspect the relevant project structure, package scripts, and existing conventions.
- Report changed files with paths and line numbers that are easy to open from Zed.
- If a verification command cannot be run, state the reason.

## Repository Context

- This is a pnpm monorepo.
- The shared internal WebGL runtime host is `@frapx/core` in `packages/core`.
- The npm package is `@frapx/fx-canvas` in `packages/fx-canvas`.
- The React binding package is `@frapx/react-canvas` in `packages/react-canvas`.
- The React binding for the particle runtime is `@frapx/react-particles` in `packages/react-particles`.
- The optional 3D noise helper package is `@frapx/glsl-noise` in `packages/glsl-noise`.
- The optional flowmap helper package is `@frapx/glsl-flowmap` in `packages/glsl-flowmap`.
- The optional signed distance function package is `@frapx/glsl-sdf` in `packages/glsl-sdf`.
- The optional raymarching package is `@frapx/glsl-raymarch` in `packages/glsl-raymarch`.
- The multipass and sample-accumulation runtime is `@frapx/fx-passes` in `packages/fx-passes` (WebGL2 only, shares the `@frapx/core` host with fx-canvas).
- The GPU particle runtime is `@frapx/fx-particles` in `packages/fx-particles` (WebGL2 only, transform feedback, shares the `@frapx/core` host; its fixed-step time model keeps manual-clock frames reproducible).
- The browser frame export tool is `@frapx/tool-capture` in `packages/tool-capture`.
- The Node rendering CLI (`frapx-render`) is `@frapx/tool-render` in `packages/tool-render`.
- The development helpers (shader error overlay for hot reloading) are `@frapx/tool-dev` in `packages/tool-dev`.
- The example app is `@frapx/example-vite-basic` in `examples/vite-basic`.
- Prefer the repository's established patterns over adding new abstractions.

## Commands

- Install: `pnpm install`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Unit tests: `pnpm test`
- E2E tests: `pnpm test:e2e`
- Dev example: `pnpm dev`

## Package Design

- `@frapx/fx-canvas` is a lightweight WebGL shader background runtime for websites.
- It should remain safe to import during SSR.
- Keep its default behavior compatible with WebGL1 / GLSL ES 1.00. Its WebGL2 support (`#version 300 es` shaders, float feedback) is additive and capability-detected; keep any further WebGL2 features that way, without breaking WebGL1 users or public APIs.
- `@frapx/fx-passes` and `@frapx/fx-particles` are WebGL2-only by design and report `unsupported` without it.
- Do not turn the package into a scene, camera, mesh, or full rendering-engine abstraction.
- Do not add new production dependencies without explicit user approval.

## Extension Architecture

- Keep `packages/fx-canvas` as the lightweight core runtime.
- Add optional capabilities such as SDF helpers, noise libraries, presets, or larger GLSL utility sets as separate packages by default.
- Naming follows a category-prefix scheme (renamed 2026-07-12, see `RELEASING.md`):
  - `core` — the shared internal WebGL runtime host (`@frapx/core`). Not installed directly by end users.
  - `fx-<name>` — an effect runtime users instantiate directly, e.g. `@frapx/fx-canvas`, `@frapx/fx-passes`, `@frapx/fx-particles`.
  - `react-<name>` — the React binding for an `fx-<name>` package, e.g. `@frapx/react-canvas`, `@frapx/react-particles`.
  - `glsl-<name>` — a GLSL snippet package meant to be concatenated into a fragment shader string, e.g. `@frapx/glsl-noise`, `@frapx/glsl-flowmap`, `@frapx/glsl-sdf`, `@frapx/glsl-raymarch`.
  - `tool-<name>` — a non-effect tool built on the runtimes, such as offline frame/video export (added 2026-10-10), e.g. `@frapx/tool-capture` (browser) and `@frapx/tool-render` (Node CLI). Keep browser and Node tools in separate packages so browser users never install Node-only dependencies.
- The offline video export roadmap and its design decisions live in `docs/frapx_export_addon.md`; its "2026-10-10 決定事項" section takes precedence over the body.
- The adoption plan (entry points, playground, docs and outreach work through 2027-01) lives in `docs/frapx_growth_plan.md`; its "2026-10-20 決定事項" section takes precedence over the body.
- The frapx × vixeq fix plan (measured pains F1–F17 from the `frapx-vixeq-lab` prototype, the issue map across both repositories, and their order) lives in `docs/frapx_vixeq_integration.md`; its "2026-10-21 決定事項" section takes precedence over the body.

## Issues and Handoff

- Work handed to another session is a GitHub issue. Its body uses the headings Problem / What exists / Proposed change / Tests / Release notes, plus Evidence and Depends on / Order when they apply (see #28–#30 and the issues listed in `docs/frapx_vixeq_integration.md`).
- Claim an issue before starting: assign it to yourself or comment that you are taking it. Do not work on an issue another session has claimed.
- Line numbers under "What exists" are as of filing; re-read the current code when they drift.
- One issue per PR; the PR body says `Closes #N`. Do not start an issue whose "Depends on" items are still open.
- Items marked "Decide …" under "Proposed change" need a proposal and the user's confirmation before implementation.
- Core must not depend on extension packages.
- Extension packages may depend on or peer with `@frapx/fx-canvas` when they need shared helpers or types.
- Small, broadly useful GLSL helpers may be added to `@frapx/fx-canvas/glsl`, but avoid turning core into a large shader snippet library.
- Add dedicated examples such as `examples/vite-sdf` when introducing new extension packages.

## Public API

- Treat exports from `packages/fx-canvas/src/index.ts` and `packages/fx-canvas/src/glsl.ts` as public API.
- Before changing public API behavior, check `packages/fx-canvas/README.md`, tests, and examples for consistency.
- Avoid breaking changes unless the user explicitly asks for them.

## Build Output

- `packages/*/dist` is generated by `pnpm build`.
- Do not manually edit generated `dist` files; change source files and rebuild.
- `dist` must exist before publishing because the package exports built files.
- Generated `dist` is not committed; run build before publishing.

## Examples

- Treat `examples/vite-basic` as an integration check and real usage example for `@frapx/fx-canvas`.
- If an example reveals an API problem, consider whether the package source, README, and tests also need updates.

## Publishing Notes

- Use independent package versioning.
- Keep package changelogs in `packages/*/CHANGELOG.md`.
- Use annotated package tags like `@frapx/fx-canvas@0.3.0`.
- Publish package changes from the package directory, not the repository root.
- Every public package ships a `LICENSE` identical to the root `LICENSE`; `pnpm check:licenses` enforces this in CI and before publishing.
- Scoped public packages should use `npm publish --access public` unless `publishConfig.access` covers it.
- Run `pnpm -w build`, `pnpm -w typecheck`, and `pnpm -w test` before publishing when feasible.
- See `RELEASING.md` for the full release procedure.
