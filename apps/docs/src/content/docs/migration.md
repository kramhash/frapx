---
title: Migration guide
description: Updating to @frapx/fx-canvas and @frapx/react-canvas 1.0, and from the pre-2026-07-12 package names.
---

## 0.x → 1.0

`@frapx/fx-canvas@1.0.0` and `@frapx/react-canvas@1.0.0` make four breaking
changes. Everything else in their API carries over unchanged.

```sh
pnpm add @frapx/fx-canvas@^1.0.0 @frapx/react-canvas@^1.0.0
```

### WebGL helpers are no longer exported from fx-canvas

`createBlitter`, `createPingPong`, `createRenderTarget`,
`supportsRenderTargetFormat` and the `Blitter`, `PingPong`, `RenderTarget`,
`RenderTargetFormat`, `RenderTargetOptions` types were deprecated in 0.12 and
are removed. Import them from `@frapx/core`, which is still 0.x and makes no
stability promise.

```diff
-import { createPingPong, type PingPong } from "@frapx/fx-canvas";
+import { createPingPong, type PingPong } from "@frapx/core";
```

Add `@frapx/core` to your dependencies if you import it directly.

### `data-frapx-shader-canvas` is gone

The canvas no longer carries `data-frapx-shader-canvas`. Select it with
`data-frapx-canvas`, which every canvas the library manages has had since the
rename and which is now part of the public API.

```diff
-.hero [data-frapx-shader-canvas] { mix-blend-mode: screen; }
+.hero [data-frapx-canvas] { mix-blend-mode: screen; }
```

### `respectReducedMotion` defaults to `true`

Under the OS "reduce motion" setting, the picture now holds a single still
frame and resumes when the setting is turned off. You no longer need to pass
`respectReducedMotion: true`. To keep animating, for example because the shader
already tones itself down with `u_reducedMotion`, opt out:

```diff
 createShaderBackground({
   target: ".hero",
   fragment,
+  respectReducedMotion: false
 });
```

```diff
-<ShaderBackground fragment={fragment} />
+<ShaderBackground fragment={fragment} respectReducedMotion={false} />
```

`@frapx/fx-passes` and `@frapx/fx-particles` still default to `false`; they
follow in their own next minor.

### `dpr` is used as given

`dpr: "auto"` (the default) is still capped by `maxDpr`, 2 unless you set it.
A number or a function is now used as given, and capped only when you also pass
`maxDpr`. Values below 1 are allowed, and a value `<= 0` or non-finite throws
`RangeError`. In 0.x every `dpr` was clamped to `[1, maxDpr ?? 2]`.

| Options | 0.x | 1.0 |
| --- | --- | --- |
| `dpr: 3` | 2 | 3 |
| `dpr: 3, maxDpr: 2` | 2 | 2 |
| `dpr: 0.5` | 1 | 0.5 |
| `dpr: () => 3` | 2 | 3 |
| `dpr: 0` | 1 | `RangeError` |
| `dpr: "auto"` on a 3× screen | 2 | 2 |
| `dpr: "auto"` zoomed out to 80% on a 1× screen | 1 | 0.8 |

To keep the old cap on a fixed or computed `dpr`, pass `maxDpr`:

```diff
 createShaderBackground({
   target: ".hero",
   fragment,
-  dpr: () => window.devicePixelRatio
+  dpr: () => window.devicePixelRatio,
+  maxDpr: 2
 });
```

The change lives in `@frapx/core`, so `@frapx/fx-passes` and
`@frapx/fx-particles` resolve `dpr` the same way once they use the new core.

## Old package names (2026-07-12)

On 2026-07-12, all five frapx packages were renamed to a category-prefixed
scheme so the package name tells you what kind of package it is. **No public
JS API changed** — `createShaderBackground`, `ShaderBackground`,
`useShaderBackground`, and every other export are exactly the same. Only the
npm package name and import path changed.

| Old name | New name |
| --- | --- |
| `@frapx/runtime` | `@frapx/core` |
| `@frapx/shader` | `@frapx/fx-canvas` |
| `@frapx/shader-react` | `@frapx/react-canvas` |
| `@frapx/shader-noise` | `@frapx/glsl-noise` |
| `@frapx/shader-flowmap` | `@frapx/glsl-flowmap` |

### Updating

```sh
pnpm remove @frapx/shader @frapx/shader-react @frapx/shader-noise @frapx/shader-flowmap
pnpm add @frapx/fx-canvas @frapx/react-canvas @frapx/glsl-noise @frapx/glsl-flowmap
```

Then update imports — a simple find-and-replace, since every export keeps
its name:

```diff
-import { createShaderBackground, glsl } from "@frapx/shader";
+import { createShaderBackground, glsl } from "@frapx/fx-canvas";

-import { ShaderBackground } from "@frapx/shader-react";
+import { ShaderBackground } from "@frapx/react-canvas";

-import { fbm3d } from "@frapx/shader-noise";
+import { fbm3d } from "@frapx/glsl-noise";

-import { flowDecode, flowDistort } from "@frapx/shader-flowmap";
+import { flowDecode, flowDistort } from "@frapx/glsl-flowmap";
```

`@frapx/runtime` → `@frapx/core` is a transitive dependency of
`@frapx/fx-canvas`; if you don't import it directly, updating `@frapx/shader`
to `@frapx/fx-canvas` handles it automatically.

### Old packages

The old npm packages are marked deprecated (pointing here) and will not
receive further updates. They are not unpublished — existing installs keep
working — but new features and fixes only land under the new names.
