# frapx × vixeq 併用の修正計画（Claude向け）

Oct 21, 2026 · @mark

frapx とステップシーケンサー [vixeq](https://github.com/kramhash/vixeq)（`@vixeq/*`）を組み合わせて使うと、どこで詰まるか。それを試作 `frapx-vixeq-lab` で実測し、見つかった痛み（F1〜F17）を両リポジトリの issue に振り分けた。このドキュメントは、その全体の順序・依存・決定事項をまとめたものです。

個々の作業は issue に書いてある。別セッションは issue 番号から着手し、全体の文脈が要るときにここを読む。判断の背景と却下した選択肢は個人の知識ベースに置き、ここには作業として実行する内容だけを書く。

## 2026-10-21 決定事項（本文より優先）

1. **修正の対象は frapx と vixeq の両方。** 作業は 1 件ずつ GitHub issue にして渡す。このドキュメントは、その親として順序と依存を持つ。
2. **橋渡しはパッケージにしない。** 時刻から値を引く純関数（V3）を vixeq 本体に入れる。それで残る 20 行程度の接続は、frapx の docs のレシピ（X5）にする。frapx と vixeq は互いに依存しない。
3. **vixeq で 1.0.0-rc.1 の前に入れるのは、破壊的になりうる V1・V2 だけ。** 追加だけで済むもの（V3〜V5）は 1.1.0。V6 は後回し。V1・V2 は vixeq の spec のタスク表に RC1J・RC1K として載せる。
4. **時期は vixeq のマイルストーン**（`1.0.0-rc.1` / `1.1.0`）で表す。frapx はマイルストーンを使わない。種類は既定のラベル（bug / enhancement / documentation）で表す。
5. **issue の本文は英語。** 見出しは #28〜#30 と同じ（Problem / What exists / Proposed change / Tests / Release notes）にし、`Evidence (frapx-vixeq-lab)` と `Depends on / Order` を足す。
6. **lab はローカルの別リポジトリ**（`~/works/dev/web/frapx-vixeq-lab`、push しない）。issue には回避策のコードを抜粋で載せ、lab のパスには依存させない。lab を example に昇格させるかは後で決める。

## 作業単位

| ID | Issue | リポジトリ | 時期 | 内容 | 依存 |
| --- | --- | --- | --- | --- | --- |
| X1 | [#36](https://github.com/kramhash/frapx/issues/36) | frapx | — | realtime clock に外部の時刻源を渡せるようにし、ゲート（offscreen / hidden / reduced-motion）を残す（F3・F15） | なし |
| X2 | [#37](https://github.com/kramhash/frapx/issues/37) | frapx | — | `destroy()` で `ready` が reject されたとき、未処理の rejection にしない（F7） | なし |
| X3 | [#38](https://github.com/kramhash/frapx/issues/38) | frapx | — | `frapx-render` に dist ディレクトリを渡したとき、サブルートの指定と SPA fallback を使えるようにする（F8） | なし |
| X4 | [#39](https://github.com/kramhash/frapx/issues/39) | frapx | — | `frapx-render --audio` で音を mux し、音の長さとグリッドを検査する（F9・F14） | なし |
| X5 | [#40](https://github.com/kramhash/frapx/issues/40) | frapx | — | docs のレシピ「シーケンサーで uniform を動かす」（F10・F17） | V3 |
| V1 | [vixeq#3](https://github.com/kramhash/vixeq/issues/3) | vixeq | 1.0.0-rc.1 | track id を呼び出し側が指定でき、自動で振る id もプロジェクト内で決まるようにする（F2） | なし |
| V2 | [vixeq#4](https://github.com/kramhash/vixeq/issues/4) | vixeq | 1.0.0-rc.1 | 負の `startPositionMs` を扱う（F13） | なし |
| V3 | [vixeq#5](https://github.com/kramhash/vixeq/issues/5) | vixeq | 1.1.0 | 時刻から値を引く純関数一式（単一パターン用のサンプラー、直前のステップの問い合わせ、attack と先読みを持つ包絡、hold イージング）（F1・F5・F6・F17） | なし |
| V4 | [vixeq#6](https://github.com/kramhash/vixeq/issues/6) | vixeq | 1.1.0 | transport で音の出力遅延を補正する（F4） | なし |
| V5 | [vixeq#7](https://github.com/kramhash/vixeq/issues/7) | vixeq | 1.1.0 | playground を `@frapx/fx-canvas` の `bindUniforms` 方式に移行する（F12） | V3 |
| V6 | [vixeq#2](https://github.com/kramhash/vixeq/issues/2) | vixeq | — | player-react でアレンジメントを編集できるようにする（F16） | 後回し |

- 並行して進められるのは X1・X2・X3・X4・V1・V2・V4。
- X5 と V5 は V3 のリリース後に着手する。
- F11（pnpm 11 の `minimumReleaseAge` のせいで、公開当日の版がインストールされない）は起票しない。リリース告知では「1 日待つか、`minimumReleaseAgeExclude` に入れる」と添える。

## lab の実測（2026-10-20〜21）

### 構成
- **場所**: `~/works/dev/web/frapx-vixeq-lab`。Vite + React で、npm 公開版のみを使う。
  - frapx: fx-canvas 0.10.1 / react-canvas 0.7.0 / fx-passes 0.3.0 / tool-capture 0.3.0 / tool-render 0.2.0
  - vixeq: `@vixeq/*` 0.9.0
- **ページは 3 つ**
  - `/bg`: Web 背景。realtime
  - `/live`: player-react で編集する。manual
  - `/music`: 128 BPM・8 小節（15.000 秒・900 フレーム）の WAV と、2 セクションのアレンジメントで、fx-passes を動かす。`registerRenderTarget` で書き出しにも対応
- **進め方**: 第 1 周は公開ドキュメントだけで書き、第 2 周でソースを読んで原因を確かめた。

### うまくいったこと
- **基本の組み合わせ**: `bindUniforms` に時刻の純関数を渡せば、リアルタイム描画、fx-passes のサブフレーム蓄積、`frapx-render` の書き出しがそのまま通る。
- **拍の位置**: 書き出したキック 32 拍は、32/32 とも期待フレームで光った。シャッター [n, n+0.5) に拍が入るフレームか、閉じ際なら次のフレーム。
- **ループの継ぎ目**: 900 と 0 はバイト一致した。
- **書き出し速度**: 1920×1080・16spp・900 フレームで約 60 秒（M4 Max）。
- **音付き動画**: frapx の出力と WAV を H.264 + AAC で mux し、取り出した音を 16 分グリッドに当てはめると、ずれは +0ms。AAC の先頭の遅延は edit list で打ち消される。
- **再レンダー**: React の再レンダーは起きない。SSR で import しても安全。

### 痛み（F1〜F17）

- **F1 → V3**: 拍のパルス（直前のトリガーからの経過時間）を時刻から引く手段が無い。
  - `createEnvelope` / `createDecayEnvelope` は `trigger()` が要る状態つきの仕組みで、シークにも書き出しにも使えない。
  - アレンジメントでは、セクションごとにパターン・ステップの細かさ・track id が違う。そのため 1 ステップずつ `resolveArrangementStep` で解き直しながら遡る必要があり、約 45 行を自作した。
- **F2 → V1**: track id がモジュール全体のカウンタで振られる。同じ名前のトラックでも、パターンが違えば別の id になる（calm の kick は `track-1`、drop の kick は `track-4`）。
  - 名前で引くと、lane 名を変えた瞬間に、エラーも出ずに対応が切れる。
- **F3 → X1**: 外部の時計（音）に合わせるには manual にして自前の rAF を回すしかなく、その間はゲートが効かない。
  - reduced-motion をエミュレートすると、realtime の `/bg` は止まったが、manual の `/live` は動き続けた。
- **F4 → V4**: `createAudioBufferTransport` の位置は `AudioContext.currentTime` そのまま。出力遅延（この Mac で base 5.8ms + output 16.0ms）の分だけ、映像が先に出る。
- **F5 → V3**: hold（サンプル＆ホールド）のイージングが無い。`() => 0` を渡すと保持になる。
- **F6 → V3**: 純粋サンプラーの形が揃っていない。
  - 単一パターン用はエンジンのインスタンスメソッドで、負の t では RangeError、範囲外は折り返す（この折り返しはドキュメントに記載なし）。
  - アレンジメント用は自由関数で、負の t も範囲外も 0 を返す。
- **F7 → X2**: fx-passes を React の `useEffect` で作ると、StrictMode の破棄で `ready` が `DestroyedError` になり、未処理の rejection としてコンソールに出る。react-canvas は内部で消化している。
- **F8 → X3**: `frapx-render dist` は `/` で固定され、SPA fallback も無い。そのため複数ページのアプリでは、`vite preview` の URL を渡すしかない。
  - なお `127.0.0.1` は preview に繋がらず、`localhost` を使う必要があった。
- **F9 → X4**: `--encode` は映像だけを書き出す。音楽同期の作品では、毎回 ffmpeg を手で叩いて mux することになる。
- **F10 → X5**: 「時刻から純関数で値を出し、シェーダーに渡す」手順のガイドが、frapx と vixeq のどちらの docs にも無い。書き出しを決定的にする条件（`get(time)` は純関数であること）も書かれていない。
- **F11 → 起票しない**: 上の「作業単位」の節を参照。
- **F12 → V5**: vixeq の playground が、deprecate 済みの `@frapx/shader` を使ったまま。
- **F13 → V2**: `createTimingMap({ startPositionMs: -29.3 })` が、エラーも出さずに 0 に丸められる。1 拍目がファイルの先頭より前にある音源を宣言できない。
- **F14 → X4**: 受け取った WAV（FL Studio 2026）は、曲全体が 1292 サンプル（29.3ms）前にずれ、その分だけ短かった。frapx も vixeq も何も言わない。lab の `scripts/check-wav.py`（ハットを 6kHz のハイパスで取り出し、16 分グリッドに当てはめる）で検出し、書き出し直しで解消した。
- **F15 → X1**: realtime の clock に再生開始時の 1 回だけ合わせる方式は、二通りにずれる。
  - ループ長が違うと、ループごとにずれが溜まる（−35〜−40ms）。
  - ループ長が揃っていても、開始時に +30〜+38ms の一定のずれが付く。
  - manual で毎フレーム追従する方式なら −5〜−8ms に収まる。
- **F16 → V6**: アレンジメントを編集する GUI が無い。曲から解析した値（ハット・energy）をパターンにするのに、`setStepValue` をステップごとに回すことになる。
- **F17 → V3 / X5**: 時刻は合っていても、体感ではずれた。picture delay で合わせると 200ms。
  - 原因: 最初のシェーダーは、拍の瞬間にリングが中央で最小で、そこから広がる形だった。
  - 拍の瞬間に画面全体を光らせ、約 80ms で消える `flash` を足すと、輝度のピークが 32/32 拍とも拍のフレームに来た。
  - 拍に合わせる表現は、立ち上がりで最大になる包絡を基本にする。純関数なら、拍の手前から動き出す予備動作も書ける。

### 再現手順（lab）
- **音源の検査**: `python3 -I scripts/check-wav.py public/music.wav`
  - 長さ・16 分グリッドのずれ・サンプルレートが NG なら、終了コード 1。
  - ピークは WARN として出すだけ。
- **解析値**: `python3 -I scripts/analyze-wav.py public/music.wav src/lib/song.analysis.json` で、ハットと energy の値を作る。
- **書き出し**: `pnpm build && pnpm exec vite preview --port 5289` を起動してから、`pnpm exec frapx-render http://localhost:5289/music --out <dir> --set spp=16` を実行する。
- **mux**: `ffmpeg -framerate 60 -i <dir>/frame_%05d.png -i public/music.wav … -c:v libx264 -c:a aac -shortest music-av.mp4`

## Claude への作業指示

**進め方**

- 着手する issue を自分に assign するか、着手する旨をコメントしてから始める。他のセッションが確保している issue には触れない。
- 作業前に、そのリポジトリの `AGENTS.md`（frapx は `RELEASING.md` も）を読む。
- issue の「What exists」の行番号は起票時点のもの。ずれていたら、現行のコードで読み直す。
- 1 issue につき 1 PR。PR 本文で `Closes #N` と書く。
- 依存（`Depends on`）が解消していない issue には着手しない。

**確認が必要なとき**

- issue の「Proposed change」にある「Decide …」の項目。名前・引数の形など、実装前に案を出して確認を取る。
- 既存 API の既定動作を変える必要が出たとき。
- vixeq で、rc.1 の API 凍結（API Extractor のレポート）に影響する変更をするとき。

**やってはいけないこと**

- frapx と vixeq のどちらかに、もう一方への依存を入れること。
- テストを通すためだけに、テストを削除したり緩めたりすること。
- npm への publish やタグ付けなど、リリース操作を確認なしに行うこと。
