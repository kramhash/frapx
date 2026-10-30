# frapx で 3D SDF テクスチャを扱う計画（Claude向け）

Oct 28, 2026 · @mark

メッシュから焼いた 3D SDF テクスチャを、frapx のレイマーチと粒子で使えるようにする計画。焼く側は別リポジトリの Blender Extension `3dsdf-texture`（`~/works/dev/blender/tools/3dsdf-texture`）。

個々の作業は issue に書いてある。別セッションは issue 番号から着手し、全体の文脈が要るときにここを読む。判断の背景と却下した選択肢は個人の知識ベースに置き、ここには作業として実行する内容だけを書く。

着手の順番（2026-10-30）: 1.0 の積み残し（#78〔PR #84 でマージ済み〕、#85、#86）を公開した後、プレイグラウンド（マイルストーン「Playground v1」）より前に行う。#71〜#73 をまとめて 1 回で公開する（core minor、fx-canvas 1.1、fx-passes / fx-particles minor、glsl-sdf-volume 0.1）。

## 2026-10-28 決定事項（本文より優先）

1. **用途はレイマーチと粒子。** ボリュームレンダリングは目的に入れない。同じ 3D テクスチャで後から書ける。
2. **core と fx に入れるのは、汎用の 3D データテクスチャ入力だけ。** SDF の形式を解釈する層は別に置く。形式が変わっても core は変わらない。
3. **Blender Extension に非圧縮 KTX2 の出力を足す。** 3D の R8 / R16F / R32F を入れ、SDF のメタは key/value の `3dsdf.meta` に入れる（下の「KTX2 の形式」）。Web 向けは KTX2 に一本化し、`.sdf.bin` は廃止した（three.js ビューアも KTX2 を読む）。Godot 向けはアトラスと `.sdf.json` のまま。
4. **KTX2 の読み取りは SDF の層に置く。** core は生データだけを受ける。KTX2 が SDF 以外でも欲しくなったら、そのとき core に昇格する。
5. **新パッケージは `@frapx/glsl-sdf-volume`。**
   - 中身は GLSL と、それに渡すデータの小さなローダー。AGENTS.md の glsl- の範囲にこの形を追記した。
   - glsl-flowmap と同じく WebGL2（`#version 300 es`）専用。
6. **汎用 3D 入力の形。** `TextureOptions` に並べて、`{ data, size: [nx, ny, nz], format, filter = "linear", wrap = "clamp" }` を足す。
   - `format` は `"r8" | "r16f" | "r32f"`。`data` はそれぞれ Uint8Array / Uint16Array（half の bit 列）/ Float32Array。
   - 並びは x 最速。対象は 3D だけ。
   - `u_<name>Size` は vec3 になる。
   - WebGL1 では `TextureLoadError` にする。
   - r32f を linear で引くには `OES_texture_float_linear` が要る。無ければ nearest に落とし、debug のときに警告する。
   - コンテキストを失ったら、保持しているデータから upload し直す。
   - fx-canvas と fx-passes に同時に入る。
7. **glsl-sdf-volume の API。**
   - `loadSdfVolume(url)` は `{ texture, uniforms(name), meta }` を返す。`meta` は KTX2 の `3dsdf.meta` を読んだもの。
   - `uniforms("sdf")` は `sdfMin` / `sdfMax`（vec3）と `sdfScale` / `sdfOffset`（float）を返す。
   - GLSL は `frapx_sdVolume(tex, p, min, max, scale, offset)` と `frapx_sdVolumeGrad(...)`。
   - 距離への変換は `d = v * scale + offset` で、GLSL に分岐を持たない。
   - bbox の外で返す値は決定事項 11 に置き換えた（当初の「箱までの距離＋箱の縁の値」は上界で、踏み越えが起きる）。
   - 配置は、呼ぶ前に利用者が `p` を変換する。
8. **fx-particles に `sdf` オプションを足す。**
   - 形は `{ volume, center: [u, v, depth], size, rotation, attract: { strength, falloff }, collide: { bounce }, emit: "surface" | "inside" }`。
   - 配置と強さは uniform にする。`setUniform` と `bindUniforms` で動かせる。
   - 書いていない機能はコードを生成しない。
   - 出現位置は、bbox 内の hash 乱数点を `p - grad * d` で 2 回表面へ寄せて作る。GPU の中で完結し、seed で決まる。
   - react-particles は `sdf` をそのまま通す。`volume` は参照で比べる。
9. **順番は fx-canvas 1.0（マイルストーン「fx-canvas 1.0」）の後。** 1.1 として入れる。Blender Extension の KTX2 は 1.0 と並行してよい。

## 2026-10-29 決定事項（本文より優先）

10. **zstd で圧縮した KTX2（`supercompressionScheme` 2）は、展開関数を渡されたときだけ読む。**
    - Blender Extension は既定では無圧縮で書き、「Zstd Compression」（CLI は `--zstd`）を付けたときだけ scheme 2 で書く。圧縮後のサイズは r8 で約 30%、r16f で約 75%、r32f で約 90%。効くのは主に r8。
    - シグネチャは `loadSdfVolume(url, { zstd?: (bytes: Uint8Array, size: number) => Uint8Array })`。`size` は levelIndex の `uncompressedByteLength`。
    - 本番依存は足さない。ブラウザ標準の `DecompressionStream` は zstd を展開できないので、展開器は利用者が持ち込む。
    - README の例は fzstd（純 JS、展開専用、gzip で約 7 KB、同期）にする: `zstd: (b, n) => decompress(b, new Uint8Array(n))`。
    - @bokuweb/zstd-wasm も渡せる。ただし wasm が 252 KB（gzip 80 KB）あり、非同期の `init()` が要るので、例には使わない。
    - scheme 2 なのに `zstd` が無いときは、「`zstd` オプションが要る」と書いたエラーにする。
    - 展開後の長さが `uncompressedByteLength` と違うときもエラーにする。
    - 3dsdf-texture の viewer-three は、同じ形（`loadSdf(url, { zstd })` に fzstd を渡す）で実装済み。

## 2026-10-30 決定事項（本文より優先）

11. **`frapx_sdVolume` は bbox の外で `max(b, e − b)` を返す。** b は点から箱までの距離、e は箱の上の最寄り点で引いた値。
    - b は「形が箱の中にある」ことから、e − b は「距離関数の傾きが 1 以下」であることから、どちらも真の距離の下界になる。sphere tracing で表面を踏み越えない。
    - 箱の近くでは e − b が効くので、b だけを返すより歩幅が大きい。
    - レイを先に箱まで進める形（viewer-three）は採らない。`frapx_map` で他の形と合成する使い方と噛み合わないため。
    - 当初の b + e は上界。GPU e2e で、b + e に差し替えると下界のテストが落ちることを確認した。
12. **`examples/vite-sdf-volume` の素材は `Suzanne.r8-zstd.sdf.ktx2`（212 KB）にし、展開は fzstd で行う。** fzstd は例のアプリの依存にだけ入れる。
    - r8 は表面から 8 ボクセルより遠い距離を頭打ちにする。そのため、帯より広い smooth union（`k` > 帯）は箱状に崩れる。例のブレンドは帯の幅（約 0.18）までにした。README の「Formats」に書いてある。

## KTX2 の形式

形式の正本は書き手の Blender Extension 側にある（`~/works/dev/blender/tools/3dsdf-texture/docs/format.md`）。読み手は viewer-three、Godot サンプル、frapx の 3 つになったので、2026-10-28 に frapx から移した。布置・key/value・メタの JSON スキーマ・`decode` の定義はそちらを見る。ここには frapx が読む範囲だけを書く。

- 読むのは `.sdf.ktx2` だけ。Godot 向けの `.sdf.json` は読まない
- 対象の版はメタの `version: 1`
- `supercompressionScheme` は 0（無圧縮）か 2（Zstandard、level 0 が zstd の 1 フレーム）。2 は決定事項 10 のとおり、展開関数を渡されたときだけ読む
- `vkFormat` は 9（`R8_UNORM`）、76（`R16_SFLOAT`）、100（`R32_SFLOAT`）の 3 つ。それぞれ汎用 3D 入力の `"r8"`、`"r16f"`、`"r32f"` に対応する
- メタは key/value の `3dsdf.meta`（UTF-8 の JSON、NUL で終わる）から取る。frapx が使う項目は `bboxMin`、`bboxMax`、`voxelSize`、`decode{scale, offset}`。`uniforms("sdf")` の `sdfScale` / `sdfOffset` は `decode` をそのまま渡す
- DFD、`KTXorientation`、`KTXwriter`、`source` は読まない
- 読み手は次の場合に、どの項目が原因かを書いたエラーを出す
  - `version` が 1 でない
  - `vkFormat` が上の 3 つ以外
  - `supercompressionScheme` が 0 でも 2 でもない
  - `supercompressionScheme` が 2 で、`zstd` が渡されていない、または展開後の長さが `uncompressedByteLength` と違う
  - `pixelDepth` が 0
  - `3dsdf.meta` が無い

## 3dsdf-texture の公開と形式の凍結

- 3dsdf-texture は、frapx の素材パイプラインとして GitHub で公開するだけにする。extensions.blender.org には、外部から需要が出るまで出さない。
- 0.x の間は形式を凍結しない。メタの `version` は 1 のままで、中身が変わることがある（変更は 3dsdf-texture の CHANGELOG に書く）。
- 3dsdf-texture 1.0 で形式 v1 を凍結する。条件は次の 2 つ。
  - #72 がこの形式の KTX2 を読み、`examples/vite-sdf-volume` が動く
  - 実案件か作品で 1 回使う
- #72 の実装中に形式の不備が見つかったら、凍結の前に 3dsdf-texture 側の `docs/format.md` を直す。

## 作業単位

マイルストーン「SDF volume」。

| Issue | 内容 | 依存 | 状態 |
|---|---|---|---|
| — | Blender Extension に KTX2 の出力を足す（別リポジトリ `kramhash/3dsdf-texture`） | なし | 実装済み（2026-10-28）。0.1.0 は GitHub Releases で配布する |
| [#71](https://github.com/kramhash/frapx/issues/71) | core に 3D データテクスチャ（fx-canvas / fx-passes）を足す | fx-canvas 1.0（#70） | PR #99 でマージ済み（未公開） |
| [#72](https://github.com/kramhash/frapx/issues/72) | `@frapx/glsl-sdf-volume` を新設し、`examples/vite-sdf-volume` でレイマーチする。パッケージの README と docs から 3dsdf-texture へ「素材はこれで作れる」とリンクする | #71。実物の素材は KTX2 の出力が前提 | 未着手 |
| [#73](https://github.com/kramhash/frapx/issues/73) | fx-particles の `sdf`（引き寄せ・衝突・出現）と react-particles | #72 | 未着手 |
