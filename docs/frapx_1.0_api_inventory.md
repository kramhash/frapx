# fx-canvas / react-canvas 1.0 の API 棚卸し（Claude向け）

Oct 28, 2026 · @mark

`docs/frapx_growth_plan.md` の Phase 1「1.0 の材料」の成果物。`@frapx/fx-canvas` と `@frapx/react-canvas` の公開 API を一覧にし、既知の不満と 1.0 で入れたい破壊的変更の候補を並べた。これを入力に 1.0 の grill を開き、その結論を次の「決定事項」節に置いた。決定事項は本文より優先する。

行番号は 2026-10-28 時点（main 3a8c6ed）。ずれていたら現在のコードを読み直す。「推測」と書いた項目はコードを読んだだけで、実行して確かめていない。

## 2026-10-28 決定事項（本文より優先）

1. **1.0 にするのは fx-canvas と react-canvas だけ。** core は 0.x の内部のまま。fx-canvas が公開する型と関数は fx-canvas が持ち、core の変更が fx-canvas の公開 API に漏れないようにする。
2. **WebGL ヘルパー（`createBlitter` / `createPingPong` / `createRenderTarget` / `supportsRenderTargetFormat` と型）は fx-canvas から外す。** 0.12 で `@deprecated` を付け、1.0 で削除する。必要な人は `@frapx/core` から import する（core は 0.x で、安定の約束は無いと明記する）。
3. **公開型は fx-canvas が自前で宣言し、値（`keyframes`、エラークラス 6 種、`glsl`、`glslUtils`、`hexToRgb(a)`）だけ core から再エクスポートする。** エラークラスは `instanceof` のため core の実体をそのまま出す。core の型との互換は vitest の `expectTypeOf` で型テストにし、CI で守る。新しい依存は足さない。
4. **時刻の getter は `time` で、巻き戻す前の値を返す。** PR #62 のレビューで確定済み。1.0 の前提。
5. **名前は fx-canvas を正とする。** fx-canvas の今の名前をそのまま凍結する。passes / particles は、それぞれの次の minor で合わせる（意味が違う particles の `reset` は残す）。1.0 の作業には含めない。
6. **React の `onShaderReady` / `onShaderError` は残す。** README の理由を「`onError` は div の DOM イベントと衝突する」に直す。
7. **react-canvas の作り直しを react-particles と同じ契約にする。** 作り直しが要る options を hook の中で値比較（plain は深い比較、関数と要素は参照）し、hook でも component でも自動で作り直す。`recreateDeps` と `recreateKey` は逃げ道として残す。
8. **core の host と fx-canvas に `onStatusChange(status)` を足し、hook の `status` をそれで追従させる。** react-particles は後で合わせる（範囲外）。
9. **`data-frapx-shader-canvas` は 1.0 で外し、`data-frapx-canvas` を公開 API として README に載せる。** ログの接頭辞は `[frapx/fx-canvas]` / `[frapx/core]` に直す。
10. **`respectReducedMotion` の既定を 1.0 で `true` にする。** react-canvas も同じ既定になる。
11. **`setUniform` の素の string オーバーロードは残す。** タイプミスは `debug: true` の警告で拾う。
12. **`dpr` は指定値を尊重する。** `"auto"` だけを `maxDpr`（既定 2）で頭打ちにする。数値と関数は、`maxDpr` を明示したときだけ頭打ちにする。1 未満も許す（0 以下と非有限値は `RangeError`）。実体は core なので、passes / particles にも効く。
13. **`canvas` / `gl` は nullable のまま。** 描画中は `RenderState.gl` を使う、と README に書く。
14. **`status` の 9 値と `supported` はそのまま凍結する。** README に各値の意味と遷移、`supported` の定義を書く。1.x で値を足すのは破壊的変更として扱う。
15. **react-canvas の既定の `aria-hidden="true"` は残す。** 意味のある絵にするときは `role="img"` と `aria-label` を書き、`aria-hidden={false}` で上書きする、と README に書く。
16. **`Rgb` / `Rgba` は書き換え可能なタプルのまま。**
17. **WebGL1 / GLSL ES 1.00 互換を既定のまま 1.0 にする。** `gl` は union 型のまま。
18. **公開はプレイグラウンドの前（11 月前半）。** 0.12（破壊しない追加と `@deprecated`）→ 1.0（破壊的変更）の順に出す。プレイグラウンドは最初から 1.0 の導入コードを生成する。告知は Phase 3 でまとめる。
19. **破壊しない追加のうち、1.0 に必須なのは 3 つ。** (a) README / docs の穴とずれ、(b) テストの穴、(c) React の handle の `setTimeSource` / `setFragment`。(d) `useShaderBackground` の example、(e) 予約済み uniform 名の警告、(f) README の推奨オプションは 1.x で足す（good first issue の候補）。
20. **作業は GitHub のマイルストーン「fx-canvas 1.0」の issue で進める。** 1 issue 1 PR。

### 作業単位

| Issue | 内容 | 版 | 依存 | 状態 |
|---|---|---|---|---|
| [#62](https://github.com/kramhash/frapx/pull/62)（#48） | `time` getter | core / fx-canvas / fx-passes / fx-particles の minor | なし | マージ済み（2026-10-28） |
| [#66](https://github.com/kramhash/frapx/issues/66) | core と fx-canvas に `onStatusChange`、ログの接頭辞の改名 | core minor / fx-canvas 0.12 | なし | マージ済み（2026-10-30、PR #77） |
| [#67](https://github.com/kramhash/frapx/issues/67) | fx-canvas の公開型を自前で宣言、core との互換の型テスト、ヘルパーに `@deprecated` | fx-canvas 0.12 | なし | マージ済み（2026-10-30、PR #80） |
| [#68](https://github.com/kramhash/frapx/issues/68) | react-canvas: 作り直しの値比較、`status` の追従、handle に `setTimeSource` / `setFragment` | react-canvas 0.9 | #66 | マージ済み（2026-10-30、PR #79） |
| [#69](https://github.com/kramhash/frapx/issues/69) | README / docs の穴とずれ、テストの穴 | — | #66〜#68（依存しない部分は先行してよい） | マージ済み（2026-10-30、PR #81） |
| [#70](https://github.com/kramhash/frapx/issues/70) | 1.0 の破壊的変更、移行ガイド、リリース | fx-canvas 1.0 / react-canvas 1.0 / core minor | #62、#66〜#69 | リリース済み（2026-10-30、PR #83） |

マイルストーンの外（1.0 の後）: passes / particles の名前を fx-canvas に合わせる、react-particles の `status` の追従、決定 19 の (d)(e)(f)。

## 2026-10-30 決定事項（本文より優先）

21. **`onStatusChange` は、`status` の値が変わるたびに、変わったその場で同期に呼ぶ。** 引数は新しい値だけにする。生まれた時点の `"idle"` では呼ばない。host の初期化はマイクロタスクで始まる（`core/src/host.ts:96`）ので、作成関数が返る前には呼ばない。最初の値は決めない（先に `stop()` を呼べば `"paused"` になる）。コールバックの中で `destroy()` を呼んでよく、遷移はそこで止まる（以後の `onReady` / `onContextLost` / `onError` は届かない）。コンテキストの復帰では、ゲートの結果だけを報告する。この規則は 1.0 で凍結する。
22. **0.12 は #66・#67・#68 がそろってから、1 回で出す。** 中身は core minor、fx-canvas 0.12、react-canvas 0.9。各 PR に、足した API ぶんの README を含める。1.0 は #69 と #70 の後に出す。
23. **`respectReducedMotion` の既定 `true`（#70）は、fx-canvas のオプション正規化に置く。** core の既定は `false` のまま残し、passes と particles はそれぞれの次の minor で合わせる（決定 5 と同じ扱い）。#70 の「Decide in the PR」はこれで解消した。
24. **#69 のうち先行できる部分も、#68 の後にまとめて行う。** README の追記が #66〜#68 と衝突しないようにするため。並行して進めるのは #67 だけ。

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
