# frapx 普及プラン（Claude向け）

Oct 20, 2026 · @mark

frapx を多くの人に使ってもらうための 3 ヶ月計画（2026-10-20 〜 2027-01 下旬）。開発と普及の作業を半々で進める。判断の背景と却下した選択肢は個人の知識ベースに置き、このドキュメントには作業として実行する内容だけを書く。

## 2026-10-20 決定事項（本文より優先）

1. **ゴールは、実案件での採用と OSS コミュニティ化の 2 つ。**
2. **最初の対象は日本の Web 制作者。** 海外（英語圏）への発信は、3 ヶ月後の振り返りで判断する。
3. **打ち出しは「自作 GLSL を本番に載せる土台」。** 書いたシェーダーを小さなランタイムで本番に出す。reduced-motion、非表示時の停止、SSR、WebGL1 互換は frapx が引き受ける。既製シェーダーのパラメータを調整するタイプのライブラリとは正面から競わず、補う側に立つ。
4. **入口は Web プレイグラウンド。** 書いた GLSL がそのまま本番の導入コードになる場所にする。v1 に入れるのは次の 2 つだけ。
   - 導入コードのコピー（vanilla / React / Astro。a11y の既定値込み）
   - uniform 注釈から自動で作るスライダー

   Shadertoy の貼り付け変換と、動画フォールバックの書き出しは v1 に入れない。
5. **言語は英語を正とする。** 日本語にするのは入口だけ（Getting Started 1 ページ、プレイグラウンドの UI、Zenn 記事）。Starlight の i18n は入れない。
6. **発信は Zenn の記事シリーズと X での作品投稿。** X は英語を併記する。note は検討枠に置く。
7. **採用事例は自社案件で作る。** fx-canvas を本番で採用し、許可が取れたものを docs の Showcase に載せる。
8. **1.0 は別の grill で決める。** プレイグラウンドを公開する前に開く。入力は API の棚卸し。
9. **コミュニティ受け入れは最小セットにする。** CONTRIBUTING、issue / PR テンプレート、Discussions、常時数件の good first issue。返答は週内を目安にする。

既定値として決めたこと（質問はしていない部分）:

- プレイグラウンドの共有は URL ハッシュで行い、バックエンドは持たない。
- プレイグラウンドは docs サイトの `/playground` に置き、今そこにある flowmap-painter は別のパスへ移す。
- プレイグラウンドが対象にするのは、fx-canvas のシングルパスと `glsl-*` スニペット。
- uniform 注釈はプレイグラウンドだけが解釈し、ランタイムの公開 API には影響させない。
- docs に `llms.txt` を置く。

## 2026-10-30 決定事項（本文より優先。決定 3 を補う）

10. **価値は 2 層で示す。** 下の層は「本番向けの挙動を引き受ける軽い土台」（fx-canvas）。上の層は「よく使う部品を 1 か所で更新し続けてまとめたもの」（glsl-sdf / noise / raymarch / flowmap、fx-passes、fx-particles、tool-capture / render）。入口（ヒーロー、最小のコード、プレイグラウンド）は fx-canvas のまま。
11. **軽さで張り合う相手は 3D エンジンだけにする。** README には three.js / Babylon.js との実測値を、測った日付と、計測リポジトリ [kramhash/frapx-bench](https://github.com/kramhash/frapx-bench) へのリンクを添えて載せる。2026-10-30 の min+gzip は frapx 11.2 kB、three.js 133.0 kB、Babylon.js 44.9 kB。
12. **OGL / twgl.js とはサイズで競わない。** 実測では同じ重さ（OGL 13.1 kB、twgl.js 11.2 kB）。「When to use something else」節で中立に紹介し、frapx はループ、サイズ追従、停止、reduced motion、コンテキストの復帰を引き受ける側だと書く。相手の更新が止まっていることは書かない。
13. **作ったきっかけ（3D エンジンを読み込まずにシェーダー 1 枚を載せたかった）を、価値提案の直後に 1 文で書く。** 反映先はルートと fx-canvas の README、docs のトップ、日本語の Getting Started。
14. **計測は frapx 本体の外（公開の計測リポジトリ）で行う。** frapx に three などの依存は入れない。数字を README に載せ直すときは、計測リポジトリで `pnpm measure` を回し直す。

## 進捗

- **Phase 0 — 看板作品と痛みの解消（完了、2026-10-20）**
  - LIMINAL VEIN（`examples/vite-liminal-vein`）を完成させた（PR #31）。
  - 作品で見つかったライブラリの痛み #28〜#30 を解消した（PR #32〜#34）。
  - 次の版を公開した: core 0.5.1、fx-canvas 0.10.1、fx-passes 0.3.0、tool-capture 0.3.0、tool-render 0.2.0。
- **Phase 1 — 入口の整備（進行中）**
  - README のヒーローと価値提案（PR #49）、npm メタデータとコミュニティの最小セット（PR #50）、GitHub の description / topics / homepage と Discussions を済ませた。good first issue は #51〜#53、#56 を起票した。
  - docs サイト（#58）: Showcase（LIMINAL VEIN。レンダーから 720p60 の AV1 webm 1.5 MB と H.264 mp4 2.0 MB を書き出し、reduced motion のときは自動再生しない）、日本語の Getting Started（`/ja/getting-started/`。トップの hero とサイドバーからリンク）、`llms.txt` を置いた。
  - 1.0 の材料として、fx-canvas と react-canvas の API を棚卸しした（`docs/frapx_1.0_api_inventory.md`）。2026-10-28 に 1.0 の grill を済ませた。決定事項と作業単位（マイルストーン「fx-canvas 1.0」、#66〜#70）は同じドキュメントにある。1.0 はプレイグラウンドの前に出す。

## Phase 1 — 入口の整備と 1.0 の材料集め（11 月前半）

- **ヒーロー素材**
  - LIMINAL VEIN の 2K ループから、README 用の短い動画（または GIF）とポスター画像を切り出す。
- **GitHub メタデータ**
  - description を、fx-canvas 単体の説明からリポジトリ全体の説明に改める。
  - topics（`webgl`, `glsl`, `shader`, `background` など）と homepage（docs の URL）を設定する。
  - `gh repo edit` はユーザーが実行する。
- **npm メタデータ**
  - 全パッケージに `homepage`（docs の該当ページ）と `bugs` を入れる。
  - `@frapx/core` に keywords を入れる。
  - 反映は各パッケージの次のリリースで行う。
- **README**（ルートの `README.md` と `packages/fx-canvas/README.md`）
  - 冒頭を次の順に並べる: ヒーロー、決定 3 の一行での価値提案、最小のコード、プレイグラウンドへのリンク。
  - 「scene / camera ではない」のような否定形の説明は後ろへ回す。
  - gzip 後のサイズを明記する。
- **docs サイト**（`apps/docs`）
  - Showcase ページを新設する（LIMINAL VEIN と、以後の自社案件）。
  - 日本語の Getting Started を単独の 1 ページとして置く。
  - `llms.txt` を置く。
- **コミュニティの最小セット**
  - `CONTRIBUTING.md` を置く。本文は英語で、日本語の issue も歓迎と明記する。
  - `.github/ISSUE_TEMPLATE/`（bug / feature）と PR テンプレートを置く。
  - Discussions を有効にし、作品共有のカテゴリを作る。
  - good first issue を 3 件ほど起票する。
- **1.0 の材料**
  - fx-canvas と react-canvas の公開 API を棚卸しする。対象は `packages/fx-canvas/src/index.ts`、`glsl.ts`、README、テスト。
  - あわせて、既知の不満と、入れたい破壊的変更の候補を洗い出す。
  - そのうえで 1.0 の grill を開く。

検証:

- `pnpm build` と `pnpm typecheck` を通す。
- docs は dev サーバーを起動し、Showcase、日本語ページ、`llms.txt` を実際のブラウザで表示して確かめる。
- npm メタデータは `pnpm pack` で作った tarball の中身で確かめる。

## Phase 2 — プレイグラウンド v1（11 月後半〜12 月中旬）

- **置き場所**
  - 新規に `apps/playground` を作る。
  - `.github/workflows/pages.yml` で docs の `/playground` に統合する。
  - flowmap-painter は `/tools/flowmap-painter` などへ移す（`apps/flowmap-painter/vite.config.ts` の `base` を変える）。
- **機能**
  - GLSL エディタとライブプレビュー（`createShaderBackground` をそのまま使う）。
  - コンパイルエラーは `@frapx/tool-dev` のオーバーレイで出す。
  - uniform 注釈（例: `// @range 0 2 @default 1`）からスライダーを作る。
  - 導入コード（vanilla / React / Astro）を生成する。reduced-motion と非表示時の停止の既定値を含める。
  - URL ハッシュで状態を共有できるようにする。examples からスターターを数本用意する。
  - UI は日本語と英語を切り替えられるようにする。
- **依存**
  - エディタ（CodeMirror 6 など）の追加は、着手時にユーザーの承認を得る。
- **1.0 との関係**
  - 1.0 の grill の結論を、プレイグラウンドの公開と揃えるかどうかは、その grill で決める。

検証は dev サーバーを起動し、実際のブラウザで次を確かめる。

1. 編集した内容がプレビューに反映される。
2. 注釈から作ったスライダーで uniform が変わる。
3. 生成した導入コードを `examples/vite-basic` 相当に貼ると、同じ絵が出る。
4. URL ハッシュで開き直すと、状態が戻る。
5. コンパイルエラーがオーバーレイに出る。

加えて、Pages のビルド成果物で `/playground` と flowmap-painter の新しいパスが 200 を返すことを確かめる。

## Phase 3 — 発信と採用事例（12 月〜1 月）

- **Zenn シリーズ**（3 本程度）
  1. 自作シェーダーを本番に載せるときの落とし穴（reduced-motion、非表示時の停止、コンテキスト消失、SSR）
  2. プレイグラウンドで作って貼るまで
  3. LIMINAL VEIN の制作記（fx-passes と書き出し）
- **X**: LIMINAL VEIN の動画と、プレイグラウンドで作った作例を URL 付きで投稿する。英語を併記し、URL で共有する投稿形式に乗せる。
- **note**: 制作会社のディレクターやデザイナーに向けて、「なぜ使うのか」「何ができるのか」を書く記事を検討する。
- **自社案件**: fx-canvas を本番で採用し、許可が取れたものから Showcase に載せる。実案件で見つかった痛みは issue にする。

## Phase 4 — 振り返り（2027-01 下旬）

- 指標を確認する。未達の場合は、認知 → プレイグラウンドへの訪問 → 導入のどの段で落ちたかを見る。
- 次の 3 つについて採否を決める。
  - 海外への発信（寄稿、英語記事）
  - Shadertoy の貼り付け変換
  - 動画フォールバックの書き出し
