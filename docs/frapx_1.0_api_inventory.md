# fx-canvas / react-canvas 1.0 の API 棚卸し（Claude向け）

Oct 28, 2026 · @mark

`docs/frapx_growth_plan.md` の Phase 1「1.0 の材料」の成果物。`@frapx/fx-canvas` と `@frapx/react-canvas` の公開 API を一覧にし、既知の不満と 1.0 で入れたい破壊的変更の候補を並べた。1.0 の grill はこれを入力にする。grill の結論はこのドキュメントの冒頭に「決定事項」節として足し、本文より優先する。

行番号は 2026-10-28 時点（main 3a8c6ed）。ずれていたら現在のコードを読み直す。「推測」と書いた項目はコードを読んだだけで、実行して確かめていない。

## 現行バージョン（npm、2026-10-28）

| パッケージ | 版 |
|---|---|
| `@frapx/core` | 0.6.0 |
| `@frapx/fx-canvas` | 0.11.0 |
| `@frapx/react-canvas` | 0.8.0 |
| `@frapx/fx-passes` | 0.4.0 |
| `@frapx/fx-particles` | 0.2.0 |
| `@frapx/react-particles` | 0.2.0 |

- core の README は、0.x の間は minor で API が変わりうると明記している（`packages/core/README.md:5`）。
- fx-canvas は `@frapx/core: workspace:^` に依存する。公開すると `^0.x` になるので、core の minor ごとに fx-canvas も出し直しが要る。

## 1. fx-canvas の公開 API

凡例: R = README に記載、T = テストあり、E = examples で使用。「core」は実体が `@frapx/core` にあるもの。

### エントリ

- `package.json` の exports は `.`、`./glsl`、`./color` の 3 つ。`src/glsl.ts` と `src/color.ts` は再エクスポートだけ。
- `./color` は README にも docs にも載っていない。

### 値

| シンボル | 実体 | 形 | 注記 |
|---|---|---|---|
| `createShaderBackground<TUniforms>(options)` | fx-canvas（`createShaderBackground.ts:58`） | ファクトリ。class は非公開 | R T E |
| `hexToRgb` / `hexToRgba` | core | `string → Rgb / Rgba`（readonly でないタプル）。不正値は throw | R T E |
| `glsl` | core | タグ関数。値は `unknown[]` | R E |
| `glslUtils` | core | `{ coverUv, containUv, rotate2d }` | R は `coverUv` のみ。テストなし |
| `createBlitter` / `createPingPong` / `createRenderTarget` / `supportsRenderTargetFormat` | core（`src/blit.ts` が再エクスポート） | WebGL ヘルパー | README なし。fx-canvas 側のテストは `createBlitter` のみ |
| `keyframes(tracks, { ease })` | core | `UniformSource` を返す | R T E（vite-timeline） |
| エラークラス 6 種 | core | `ShaderError`、`ShaderCompileError`（`stage`、`lines`）、`UnsupportedError`、`TargetNotFoundError`、`TextureLoadError`、`DestroyedError` | README は `DestroyedError`、`UnsupportedError`、`ShaderCompileError.lines` のみ |

### 型

- fx-canvas 自身の型: `CreateShaderBackgroundOptions`、`ShaderBackgroundInstance`、`RenderState`、`FeedbackOptions`、`FeedbackFormat`。
- `packages/fx-canvas/src/types.ts:10-63` が、core と同じ形の型を別に宣言している（`GLContext`、`ShaderLayer`、`RenderMode`、`ClockMode`、`TimeSource`、`Resolution`、`DprOption`、`ShaderStatus`、`Texture*`、`Capture*`）。構造的型付けなので今は実害がないが、ずれる余地がある。
- core からの再エクスポート: `Rgb`、`Rgba`、`Blitter`、`PingPong`、`RenderTarget*`、`ShaderErrorLine`、`ShaderStage`、`Ease`、`Keyframe*`、`UniformSource`、`Uniform*` 一式。

### `createShaderBackground` のオプション

定義は `types.ts:130-196`。既定値の実体は core の `host.ts` と `internal/dom.ts`。

| option | 既定 | R | T | E |
|---|---|---|---|---|
| `target` / `canvas` | — | ○ | ○ / — | ○ |
| `fragment`（必須） / `vertex` | — / 内蔵 | ○ / 一覧のみ | ○ / — | ○ |
| `uniforms` / `textures` | — | ○ | — / ○ | ○ |
| `feedback` | `false`（`true` は rgba8） | ○ | ○ | ○ |
| `layer` | `"background"` | ○ | **なし** | なし |
| `autoStart` | `true` | 一覧のみ | 間接 | なし |
| `pauseWhenOffscreen` / `pauseWhenHidden` | `true` / `true` | ○ | ○ | — |
| `respectReducedMotion` | `false` | ○ | ○ | ○ |
| `renderMode` | `"always"` | ○ | ○ | — |
| `clock` / `timeSource` | `"realtime"` / — | ○ | ○ | ○ |
| `resolution` | target も canvas も無いときは必須 | ○ | ○ | ○ |
| `dpr` / `maxDpr` | `"auto"` / 2 | ○ | ○ / **なし** | — |
| `autoResize` | `true` | 一覧のみ | 間接 | — |
| `debug` | `false` | ○ | — | ○ |
| `canvasClass` / `canvasStyle` | — | ○ | **なし** | — |
| `onReady` / `onError` / `onBeforeRender` / `onResize` | — | ○ | ○ | — |
| `onAfterRender` | — | ○ | **なし** | ○ |

`FeedbackOptions`（`types.ts:91-112`）: `uniform`（既定 `"previousFrame"`）、`filter`、`wrap`、`clearColor`、`format`（既定 `"rgba8"`）、`formatFallback`（既定 `true`）。

### インスタンス（`types.ts:198-282`）

| メンバー | 注記 |
|---|---|
| `canvas` / `gl` | どちらも nullable。README は `fx.canvas` のみ |
| `status`（9 値） / `supported` | README は `status` に軽く触れるだけ。`supported` は記載なし |
| `ready: Promise<void>` | R T E |
| `clock` / `feedbackFormat` | getter |
| `start` / `stop` / `render` / `resize` / `destroy` | R T |
| `setTime(sec)` | 非有限値で `RangeError`（`core/src/host.ts:155`）。README に記載なし |
| `setClock` / `setTimeSource` / `setResolution` | R T |
| `captureFrame({ format, signal })` | R T（e2e） E |
| `resetFeedback()` | R T |
| `setFragment(src): ShaderCompileError \| null` | throw しない。R T（e2e） |
| `bindUniforms(source): () => void` | R T（e2e） E |
| `setTexture` / `setTextures` | reject と `onError` の両方が起きる。README に明記なし |
| `setUniform`（型付きと素の string の 2 オーバーロード） / `setUniforms` | `setUniforms` はテストなし |

- 現在の時刻を読む getter が無い（core の `elapsed` は private）。#48 / PR #62。
- イベントエミッタは無く、コールバックだけ。

### 組み込み uniform

`createShaderBackground.ts:538-554`。README の Built-In Uniforms 節と一致している。`u_time`、`u_delta`、`u_resolution`、`u_viewportSize`、`u_pixelRatio`、`u_pointer`、`u_pointerUv`、`u_pointerActive`、`u_reducedMotion`、`u_<feedback>` / `u_<feedback>Size`、`u_<tex>` / `u_<tex>Size`。予約名のガードは無く、`setUniform("time", …)` は毎フレーム上書きされる。

### DOM

canvas に `data-frapx-canvas`（`core/src/internal/dom.ts:129`）と `data-frapx-shader-canvas`（`createShaderBackground.ts:147`）が付く。どちらも README に記載なし。

## 2. react-canvas の公開 API

exports: `ShaderBackground`、`ShaderBackgroundHandle`、`ShaderBackgroundProps`、`useShaderBackground(options, recreateDeps = [])`、`UseShaderBackgroundOptions`、`UseShaderBackgroundResult`。

- `ShaderBackground` は `forwardRef` の div。既定で `aria-hidden="true"`。className が無いときだけ `position: relative; overflow: hidden` を付ける（`ShaderBackground.tsx:130-133,204`）。
- props は core のオプションから `target`、`onReady`、`onError` を除き、`onShaderReady`、`onShaderError`、`uniformSources`、（component のみ）`recreateKey` と div の属性を足したもの。

その場で反映する props と、変えると作り直す props（`ShaderBackground.tsx:71-121`）:

| 分類 | props |
|---|---|
| その場で反映 | `fragment`（`setFragment`）、`uniforms`、`textures`、`clock`、`timeSource`、`resolution`（値で比較）、`uniformSources`（同一性で比較）、`on*` |
| 作り直す | `canvas`、`vertex`、`feedback`、`layer`、`autoStart`、`pauseWhenOffscreen`、`pauseWhenHidden`、`respectReducedMotion`、`renderMode`、`dpr`、`maxDpr`、`autoResize`、`debug`、`canvasClass`、`canvasStyle`、`recreateKey` |

handle（`ShaderBackground.tsx:29-60`）: `getInstance`、`start`、`stop`、`render`、`resize`、`destroy`、`setTime`、`setClock`、`setResolution`、`captureFrame`、`resetFeedback`、`bindUniforms`、`setTexture(s)`、`setUniform(s)`。`setTimeSource`、`setFragment`、`status`、`clock`、`feedbackFormat` は `getInstance()` 経由でしか届かない。

テスト（`test/ShaderBackground.test.tsx`、19 ケース）にないもの: `onResize` / `onBeforeRender` / `onAfterRender` の受け渡し、`layer`、`recreateKey`、`canvas`。hook を直接使うのは 1 ケースだけ。examples で使っているのは `examples/vite-react` だけで、`useShaderBackground` を使う example は無い。

## 3. 不整合

### パッケージ間の名前

| 概念 | 差 |
|---|---|
| フィードバックのリセット | canvas / passes は `resetFeedback()`、particles は `reset()`（`fx-particles/src/types.ts:252`） |
| `setFragment` | canvas は `(fragment)`、passes は `(name, fragment)` |
| `onResize` | canvas / passes にあり、particles に無い |
| float 形式の指定 | canvas は `feedback.format` / `feedback.formatFallback`、particles は最上位の `format` / `formatFallback` |
| React のコールバック | `onShaderReady` / `onParticlesReady` と、core の `onReady`。README の理由は「DOM 属性との衝突回避」だが、`onReady` は DOM 属性ではない（`onError` は `<div>` にある） |
| render state の型名 | canvas は `RenderState`、passes は `PassesRenderState`（同じ形） |
| `gl` の型 | canvas は `GLContext`（WebGL1/2 の union）、passes / particles は `WebGL2RenderingContext` |

### README と実装のずれ

1. SSR: README（471 行目、521 行目）は「no-op instance を返し `ready` が reject する」。実際は普通のインスタンスで、microtask で `UnsupportedError` になり `status === "unsupported"`、`onError` も呼ばれる（`core/src/host.ts:603-607,818-826`）。
2. Instance API の一覧に `gl`、`supported`、`status` が無い。
3. `./color` の subpath、再エクスポートしているヘルパー群、エラークラス 3 種、`glslUtils.containUv` / `rotate2d` が無い。
4. `dpr` は数値や関数で指定しても `maxDpr`（既定 2）で頭打ちになり、1 未満は 1 になる（`core/src/internal/dom.ts:93`）。README に記載なし。
5. `setTime` の `RangeError`、`setTexture` の reject と `onError` の両方の発火が書かれていない。
6. Examples 節に `vite-hot-reload`、`vite-timeline`、`vite-sdf` などが無い。
7. ログの接頭辞がリネーム前の名前のまま: `[frapx/shader]`（`createShaderBackground.ts:643`）、`[frapx/runtime]`（`core/src/host.ts:855`）。passes / particles は `[frapx/passes]` / `[frapx/particles]`。

### 型のゆるさ

- `canvas` / `gl` が nullable で、使うたびに絞り込みが要る。`RenderState.gl` を WebGL2 に絞るにはキャストが要る。
- `onError(error: Error)` が `ShaderError` 系に絞られていない。
- `setUniform` に素の string のオーバーロードがあるので、`TUniforms` を書いても未定義名を弾けない。
- `Rgb` / `Rgba` が readonly でない。

## 4. 既知の不満

- **#48**（OPEN、PR #62 が変更依頼中）: インスタンスから現在時刻を読めない。名前（`time` / `currentTime`）と、`accumulation.loop` のときに巻き戻した値を返すかが未決。fx-canvas / fx-passes / fx-particles が対象。
- **#63**（OPEN、#48 待ち）: LIMINAL VEIN は時刻を読み戻すためだけに、自前の無音クロック（`examples/vite-liminal-vein/src/soundtrack.ts:26-31`）を `timeSource` として常に渡している。
- **#40**（OPEN、vixeq#5 待ち）: シーケンサーで uniform を動かす docs のレシピ。`keyframes` などの `get(time)` が純関数であるべきという条件が fx-canvas の docs に無い（F10、`docs/frapx_vixeq_integration.md:76`）。
- 解決済み: F3 / F15 → `timeSource`（#36）、F7 → `ready` の未処理 rejection（#37）。
- `src` 配下に TODO / FIXME は無い。`ShaderBackground.tsx:69-70` の「core にオプションが増えたらここに足す」は手で揃える箇所。`_assertComplete` で漏れは型エラーになるが、`RUNTIME_KEYS`（`:108`）の分類間違いは検知できない（推測）。

react-canvas の構造的な懸念（推測、再現していない）:

- `STATIC_KEYS` は `useEffect` の依存配列に並ぶので `Object.is` で比べる（`useShaderBackground.ts:169`）。`feedback={{ format: "rgba16f" }}`、`canvasStyle={{ … }}`、`dpr={() => …}` をインラインで書くと、レンダーのたびに作り直される。README が安定化を求めているのは `uniforms` / `textures` だけで、`resolution` だけ値で比べている。
- hook の `status` は `useState` で、running / paused / context-lost への変化では更新されない。
- 作り直しの手段が hook の `recreateDeps` と component の `recreateKey` の 2 つある。
- `uniforms` のオブジェクトからキーを消しても、そのキーの値は戻らない。
- handle の `destroy()` のあと React 側の state は変わらず、以降の呼び出しは何もしない。戻すには `recreateKey` を変える。

これまでの破壊的変更（CHANGELOG）: 0.4.0 で `pauseWhenHidden` の既定を `true` に、0.5.0 で `gl` を union 型に、0.7.0 でパッケージ名を `@frapx/shader` から変更。

## 5. 1.0 の破壊的変更の候補

### 強く推す

| ID | 内容 | 壊れるもの | 移行 |
|---|---|---|---|
| A | core との関係を決める。案は「core も 1.0」「再エクスポートを fx-canvas 側で固定」「`createBlitter` 系は core から直接 import」のどれか。重複した型宣言（`types.ts:10-63`）も 1 か所にまとめる | 再エクスポートを減らせば import 元が変わる | 1 つの minor で `@deprecated` を付けてから外す |
| B | 時刻の getter（#48）の名前と意味を 1.0 の前に決め、passes / particles と揃える | 追加なので今は何も壊れない。1.0 の後で名前を変えると壊れる | 不要 |
| C | パッケージ間の名前を揃える（`reset` と `resetFeedback`、`format` の置き場所、`setFragment` の引数、particles の `onResize`、React の `on*Ready`） | 該当 API の名前 | 旧名を 1 つの minor で別名として残す |
| D | react-canvas の作り直しの契約。作り直すオプションを値で比べる、`recreateDeps` を廃止して `recreateKey` に一本化、`status` を状態の変化に追従させる | hook の第 2 引数。`status` の更新が増える | `recreateDeps` は 1 つの minor で警告を出してから外す |
| E | 旧名の片付け（ログの接頭辞、`data-frapx-shader-canvas`） | この属性をセレクタに使っている利用者 | 一時的に新旧両方の属性を付ける |

### 検討

- `respectReducedMotion` の既定を `true` にする。プレイグラウンドの導入コードで a11y の既定値を出す方針（growth plan の決定 4）と揃える。
- `setUniform` から素の string のオーバーロードを外す。`uniforms` を型で宣言していない利用者が全員壊れる。
- `canvas` / `gl` を null にならない型にする（`ready` が解決する値の側に持たせるなど）。
- `dpr` と `maxDpr` の関係を仕様として固定するか、分けるか。
- `status` の 9 値と `supported` の重なりを整理する。
- react-canvas の `aria-hidden` の既定。背景以外の用途では落とし穴になる。
- `Rgb` / `Rgba` を readonly にする。
- WebGL2 を前提にするか。AGENTS.md は WebGL1 互換を既定と定めているので、変えるなら別の大きな判断になる。

## 6. 破壊的変更なしで 1.0 までに足すもの

1. 時刻の getter（#48）を canvas / passes / particles に同時に足す。
2. README と docs の穴を埋める。§3 の「README と実装のずれ」1〜6 と、`get(time)` が純関数である条件（F10）。
3. テストを足す。fx-canvas: `layer`、`maxDpr`、`canvasClass` / `canvasStyle`、`onAfterRender`、`setUniforms`、SSR（Node で呼んで `unsupported` になる）、`glslUtils` の各スニペットがコンパイルできること。react-canvas: `onResize` / `onBeforeRender` / `onAfterRender` の受け渡し、`layer`、`recreateKey`、hook を直接使う場合。
4. React の handle に `setTimeSource` と `setFragment` を足す（または README で `getInstance()` の使い方を示す）。
5. `useShaderBackground` を使う example を足す。
6. `debug: true` のとき、予約済みの uniform 名を `setUniform` に渡したら警告する。
7. a11y の既定値を含む「推奨オプション」を README に 1 つ示す。プレイグラウンドの導入コードと揃える。

## 調べていない範囲

- fx-passes / fx-particles は名前の比較のために `types.ts` だけを読んだ。組み込み uniform 名が揃っているかは確かめていない。react-particles は一部だけ読んだ。
- examples での使用は `examples/` と `apps/` 配下の `*.ts` / `*.tsx` / `*.astro` / `*.mdx` を単語で検索して調べた。
- テストは実行していない。T は、テストファイルにその語が出てくるかどうかで判定した。
- `apps/docs` は `fx-canvas.mdx`、`react-canvas.mdx`、`migration.md` の一部だけを読んだ。
