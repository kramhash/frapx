# Releasing

This repository uses independent package versioning. Each public package is
released, tagged, and documented on its own.

## Packages

| Package | Directory | Latest tag | Notes |
| --- | --- | --- | --- |
| `@frapx/fx-canvas` | `packages/fx-canvas` | `@frapx/fx-canvas@1.0.1` | Depends on `@frapx/core`. Publish after it. |
| `@frapx/react-canvas` | `packages/react-canvas` | `@frapx/react-canvas@1.0.0` | Depends on `@frapx/fx-canvas`. Publish after it. |
| `@frapx/react-particles` | `packages/react-particles` | `@frapx/react-particles@0.5.0` | Depends on `@frapx/fx-particles`. Publish after it. |
| `@frapx/glsl-noise` | `packages/glsl-noise` | `@frapx/glsl-noise@0.3.0` | |
| `@frapx/glsl-flowmap` | `packages/glsl-flowmap` | `@frapx/glsl-flowmap@0.4.1` | |
| `@frapx/glsl-sdf` | `packages/glsl-sdf` | `@frapx/glsl-sdf@0.1.0` | |
| `@frapx/glsl-raymarch` | `packages/glsl-raymarch` | `@frapx/glsl-raymarch@0.1.0` | |
| `@frapx/fx-passes` | `packages/fx-passes` | `@frapx/fx-passes@0.7.0` | Depends on `@frapx/core`. Publish after it. |
| `@frapx/fx-particles` | `packages/fx-particles` | `@frapx/fx-particles@0.5.0` | Depends on `@frapx/core` and `@frapx/glsl-noise`. Publish after them. |
| `@frapx/tool-capture` | `packages/tool-capture` | `@frapx/tool-capture@0.3.0` | Browser export tool. Structurally typed; no runtime dependency on `@frapx/fx-canvas`. |
| `@frapx/tool-render` | `packages/tool-render` | `@frapx/tool-render@0.3.0` | Node CLI (`frapx-render`). Depends only on `playwright-core`; renders pages that use `@frapx/tool-capture`. |
| `@frapx/tool-dev` | `packages/tool-dev` | `@frapx/tool-dev@0.1.0` | Development helpers (shader error overlay). No dependencies. |
| `@frapx/core` | `packages/core` | `@frapx/core@0.8.0` | Shared runtime. Publish before the `fx-*` packages. |

These packages were renamed on 2026-07-12 (formerly `@frapx/runtime`, `@frapx/shader`,
`@frapx/shader-react`, `@frapx/shader-noise`, `@frapx/shader-flowmap`). The old npm
packages are deprecated — see "Deprecating a Renamed Package" below.

Package names follow the category-prefix scheme described in `AGENTS.md`
(`core`, `fx-*`, `react-*`, `glsl-*`, and — since 2026-10-10 — `tool-*` for
export tooling). Add new packages to the table above when they are first released.

Examples and documentation changes do not require a package release unless they
also change package metadata or published package contents.

### Internal (workspace) dependencies

Packages that depend on another package in this repo (`@frapx/fx-canvas`,
`@frapx/fx-passes` and `@frapx/fx-particles` on `@frapx/core`,
`@frapx/fx-particles` also on `@frapx/glsl-noise`, `@frapx/react-canvas` on
`@frapx/fx-canvas`, `@frapx/react-particles` on `@frapx/fx-particles`) declare that
dependency as `workspace:^` in `package.json`. Publish with `pnpm publish`,
which rewrites `workspace:^` to the caret range of the dependency's current
published version (e.g. `^0.6.1`) at pack time. Do **not** use `npm publish`
for these packages: `npm` does not understand the `workspace:` protocol and
will publish the literal string `workspace:^` as the dependency range, which
breaks `npm install` for consumers. (This happened to `@frapx/react-canvas@0.2.0`;
it shipped with an unresolved `"@frapx/fx-canvas": "workspace:*"` dependency and
was fixed in `0.3.0`.) Packages with no internal dependencies (`@frapx/core`, the `glsl-*`
packages and the `tool-*` packages) are unaffected, but use
`pnpm publish` throughout for consistency.

Always publish internal dependencies in dependency order (e.g. `@frapx/core`
before the `fx-*` packages, `@frapx/glsl-noise` before `@frapx/fx-particles`,
`@frapx/fx-canvas` before `@frapx/react-canvas`, `@frapx/fx-particles` before
`@frapx/react-particles`) so the
caret range resolves to an already-published version.

## Versioning

Apply SemVer per package:

- Patch: bug fixes, documentation corrections shipped with the package, and
  internal changes that do not add public API.
- Minor: additive public API, new exported helpers, new components/hooks, and
  backward-compatible behavior improvements.
- Major: breaking API, type, or behavior changes.

Although the packages are still `0.x`, treat breaking changes as release events
that need explicit notes and careful versioning. Do not hide breaking changes in
patch releases.

## Changelogs

Each public package owns its changelog:

- `packages/core/CHANGELOG.md`
- `packages/fx-canvas/CHANGELOG.md`
- `packages/react-canvas/CHANGELOG.md`
- `packages/react-particles/CHANGELOG.md`
- `packages/glsl-noise/CHANGELOG.md`
- `packages/glsl-flowmap/CHANGELOG.md`
- `packages/glsl-sdf/CHANGELOG.md`
- `packages/glsl-raymarch/CHANGELOG.md`
- `packages/tool-capture/CHANGELOG.md`
- `packages/fx-passes/CHANGELOG.md`
- `packages/fx-particles/CHANGELOG.md`
- `packages/tool-render/CHANGELOG.md`
- `packages/tool-dev/CHANGELOG.md`

Use this format:

```md
# Changelog

## 0.3.0 - 2026-06-15

### Added
- Added ...

### Changed
- Changed ...
```

GitHub Release notes should be based on the matching package changelog section.

## Build Artifacts

- `packages/*/dist` is generated by `pnpm -w build`.
- Do not edit or commit `dist`.
- Run `pnpm -w build` before publishing; package `files` entries include
  `dist`.

## Release Commit

Keep implementation commits and release commits separate. A release commit should
contain only package metadata and changelog changes.

Examples:

```txt
Add runtime texture updates
Release @frapx/fx-canvas@0.3.0

Add React shader bindings
Release @frapx/react-canvas@0.1.0
```

If multiple packages are released together, one release commit is acceptable, but
tags and GitHub Releases still remain package-specific.

## Automated Release Procedure

Publishing runs via `.github/workflows/publish.yml`, triggered by pushing a
package tag (`@frapx/<pkg>@<version>`, e.g. `@frapx/fx-canvas@0.6.2`). The
workflow:

1. Parses the package name, version, and directory from the tag.
2. Verifies the target `package.json` `name`/`version` match the tag (fails
   the run if they don't, to prevent tagging the wrong commit).
3. Runs `pnpm build`, `pnpm typecheck`, and `pnpm test` across the workspace.
4. Publishes using npm
   [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) —
   no npm token is stored in the repository. The workflow drives the OIDC
   exchange itself (fetch a GitHub ID token, exchange it for a short-lived
   per-package npm token, publish with `pnpm publish --access public
   --no-git-checks --provenance`, then remove the token) rather than relying
   on `pnpm publish`'s built-in OIDC support, which has been unreliable in
   practice (the exchange silently never completes and the request falls
   through to an unauthenticated call — see `.github/workflows/publish.yml`
   for the exact mechanism). For the same reason, `actions/setup-node`'s
   `registry-url` input must **not** be set in this workflow: it writes an
   `_authToken` line into `.npmrc` even when empty, which makes `pnpm
   publish` skip OIDC entirely.
5. Extracts the matching `## <version>` section from the package's
   `CHANGELOG.md` and creates a GitHub Release from it.

To release a package:

1. Check for a newer pnpm patch in the pinned major (`npm view pnpm@12
   version`). If there is one, first raise `packageManager` in the root
   `package.json`, run `pnpm install`, and merge that in its own PR.
2. Update `package.json` version and `CHANGELOG.md` as described above,
   respecting internal dependency publish order (`@frapx/core` before
   `@frapx/fx-canvas`, `@frapx/fx-canvas` before `@frapx/react-canvas`).
3. Commit the release metadata and push to `main`.
4. Tag and push:

   ```sh
   git tag -a "@frapx/fx-canvas@0.6.2" -m "@frapx/fx-canvas@0.6.2"
   git push origin "@frapx/fx-canvas@0.6.2"
   ```

5. Watch the `Publish Package` run in GitHub Actions. If it fails before the
   publish step, no npm package or GitHub Release is created — fix the issue,
   delete the tag (`git push origin :refs/tags/<tag>` and
   `git tag -d <tag>`), and re-tag once the commit is corrected.

### Trusted Publisher Setup (one-time, per package)

Each package must have a Trusted Publisher registered on npmjs.com before its
first automated publish (Settings → Trusted Publisher on the package page):

- Owner: `kramhash`, Repository: `frapx`, Workflow file: `publish.yml`

npm does not allow registering a Trusted Publisher for a package that has
never been published. For a package with no prior npm release, publish it
once manually (see "Manual Release Procedure" below) to create the package,
then register the Trusted Publisher before relying on the automated
workflow for subsequent releases.

## Manual Release Procedure

Use this procedure only for a package's first-ever publish (before a Trusted
Publisher can be registered) or as a fallback if the automated workflow is
unavailable.

Set the package details:

```sh
PACKAGE_DIR=packages/react-canvas
PACKAGE_NAME=@frapx/react-canvas
VERSION=0.1.0
TAG="$PACKAGE_NAME@$VERSION"
```

Update package metadata and changelog:

1. Update `$PACKAGE_DIR/package.json` version.
2. Update `$PACKAGE_DIR/CHANGELOG.md`.
3. Ensure `$PACKAGE_DIR/package.json` `files` includes `dist`, `README.md`, and
   `CHANGELOG.md`.
4. Commit the release metadata.

Verify:

```sh
pnpm -w typecheck
pnpm -w test
pnpm -w build
```

Push the release commit before publishing:

```sh
git push origin main
```

Dry-run and publish from the package directory using `pnpm publish` (not
`npm publish` — see "Internal (workspace) dependencies" above for why):

```sh
cd "$PACKAGE_DIR"
pnpm publish --dry-run --access public
pnpm publish --access public
cd -
```

After the publish succeeds, create and push an annotated package tag:

```sh
git tag -a "$TAG" -m "$TAG"
git push origin "$TAG"
```

Create a published GitHub Release for the package tag. Use the GitHub UI or:

```sh
gh release create "$TAG" --title "$TAG" --notes-file /tmp/release-notes.md
```

Do not create or push release tags before the publish succeeds.

## Deprecating a Renamed Package

When a package is renamed (clean break, no re-export shim — see the 2026-07-12
rename of `@frapx/runtime` / `@frapx/shader` / `@frapx/shader-react` /
`@frapx/shader-noise` / `@frapx/shader-flowmap` to `@frapx/core` /
`@frapx/fx-canvas` / `@frapx/react-canvas` / `@frapx/glsl-noise` /
`@frapx/glsl-flowmap`), deprecate the old npm package **after** the new one has
published successfully:

```sh
npm deprecate @frapx/shader "Renamed to @frapx/fx-canvas. Run: pnpm remove @frapx/shader && pnpm add @frapx/fx-canvas"
```

This does not unpublish or break existing installs; it only surfaces a warning
pointing consumers at the new name. Do not add a re-export shim to the old
package — pre-1.0 adoption is low enough that the deprecation notice is
sufficient.

## Retroactive Tags

For releases that were published before this policy, create retroactive package
tags only when the exact release commit is known. Do not tag approximate commits.

Example:

```sh
git tag -a @frapx/fx-canvas@0.3.0 533ed40 -m "@frapx/fx-canvas@0.3.0"
```

## Branch Strategy

Use trunk-based development:

- Keep `main` releasable.
- Use short-lived feature/fix branches or direct commits for small changes.
- Do not create release branches unless parallel maintenance lines are needed.
- Hotfixes go through `main` and receive package-specific patch releases.

## Notes on Bootstrapping a New Package

Copy the root `LICENSE` into the new package directory. npm includes it in
the tarball automatically, and `pnpm check:licenses` (run in CI and before
publishing) fails if it is missing or differs from the root copy.

When manually publishing a package for the first time (see "Trusted
Publisher Setup" above), pushing the release tag afterward will still
trigger `.github/workflows/publish.yml`. That run will pass build/typecheck/
test and the tag/package-metadata check, then fail at the `pnpm publish` step
because the version is already on npm — this is expected and harmless. Once
the Trusted Publisher is registered, subsequent tags for that package publish
normally through the workflow.
