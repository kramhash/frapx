# frapx で 3D SDF テクスチャを扱う計画（Claude向け）

Oct 28, 2026 · @mark

メッシュから焼いた 3D SDF テクスチャを、frapx のレイマーチと粒子で使えるようにする計画。焼く側は別リポジトリの Blender Extension `3dsdf-texture`（`~/works/dev/blender/tools/3dsdf-texture`）。

個々の作業は issue に書いてある。別セッションは issue 番号から着手し、全体の文脈が要るときにここを読む。判断の背景と却下した選択肢は個人の知識ベースに置き、ここには作業として実行する内容だけを書く。

## 2026-10-28 決定事項（本文より優先）

1. **用途はレイマーチと粒子。** ボリュームレンダリングは目的に入れない。同じ 3D テクスチャで後から書ける。
2. **core と fx に入れるのは、汎用の 3D データテクスチャ入力だけ。** SDF の形式を解釈する層は別に置く。形式が変わっても core は変わらない。
3. **Blender Extension に非圧縮 KTX2 の出力を足す。** 3D の R16F / R8 を入れ、SDF のメタは key/value に入れる（下の「KTX2 の形式」）。`.sdf.json` + `.sdf.bin` は three.js ビューア用に残してよい。Godot 向けはアトラスのまま。
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
   - `loadSdfVolume(url)` は `{ texture, uniforms(name), meta }` を返す。
   - `uniforms("sdf")` は `sdfMin` / `sdfMax`（vec3）と `sdfScale` / `sdfOffset`（float）を返す。
   - GLSL は `frapx_sdVolume(tex, p, min, max, scale, offset)` と `frapx_sdVolumeGrad(...)`。
   - 距離への変換は `d = v * scale + offset` で、GLSL に分岐を持たない。
   - bbox の外では「箱までの距離＋箱の縁の値」を返す。
   - 配置は、呼ぶ前に利用者が `p` を変換する。
8. **fx-particles に `sdf` オプションを足す。**
   - 形は `{ volume, center: [u, v, depth], size, rotation, attract: { strength, falloff }, collide: { bounce }, emit: "surface" | "inside" }`。
   - 配置と強さは uniform にする。`setUniform` と `bindUniforms` で動かせる。
   - 書いていない機能はコードを生成しない。
   - 出現位置は、bbox 内の hash 乱数点を `p - grad * d` で 2 回表面へ寄せて作る。GPU の中で完結し、seed で決まる。
   - react-particles は `sdf` をそのまま通す。`volume` は参照で比べる。
9. **順番は fx-canvas 1.0（マイルストーン「fx-canvas 1.0」）の後。** 1.1 として入れる。Blender Extension の KTX2 は 1.0 と並行してよい。

## KTX2 の形式

frapx が読む形式の正はここに置く。Blender Extension はこれに従って書く。

- KTX 2.0 で、非圧縮にする（`supercompressionScheme = 0`）。
- `vkFormat` と `typeSize` の組み合わせ:

  | `vkFormat` | 形式 | `typeSize` |
  |---|---|---|
  | 9 | `R8_UNORM` | 1 |
  | 76 | `R16_SFLOAT` | 2 |
  | 100 | `R32_SFLOAT` | 4 |

- `pixelWidth`、`pixelHeight`、`pixelDepth` には nx、ny、nz（すべて 1 以上）を入れる。
- 残りのヘッダー値は `layerCount = 0`、`faceCount = 1`、`levelCount = 1`。
- DFD は仕様どおり、`vkFormat` に合う basic descriptor を書く。frapx は DFD を読まない。
- level 0 の並びは次のとおり。
  - x が最速。
  - 次が y で、行 0 が y の最小。
  - 最後が z で、スライス 0 が z の最小。
- key/value に `frapx.sdf` を置く。値は UTF-8 の JSON で、NUL で終える。

```json
{
  "version": 1,
  "bboxMin": [-1.458, -1.094, -0.957],
  "bboxMax": [1.458, 1.094, 0.957],
  "voxelSize": 0.02279,
  "units": "local",
  "axis": "y_up_gltf",
  "sign": "negative_inside",
  "decode": { "scale": 1, "offset": 0 }
}
```

- `bboxMin` と `bboxMax` は、ボクセル格子の外側の面。ボクセル i の中心は `bboxMin + (i + 0.5) * voxelSize` にある。
- `decode` はテクスチャの値 v から距離への変換。
  - r16f と r32f は `{ scale: 1, offset: 0 }`。
  - r8 は値を `clamp(d / band, -1, 1) * 0.5 + 0.5` で書くので、`{ scale: 2 * band, offset: -band }` になる。
- 任意の `source`（元の object 名、三角形数、backend）を足してよい。frapx は読まない。
- 読み手は次の場合に、どの項目が原因かを書いたエラーを出す。
  - `version` が 1 でない。
  - `vkFormat` が上の 3 つ以外。
  - `supercompressionScheme` が 0 でない。
  - `pixelDepth` が 0。
  - `frapx.sdf` が無い。

## 作業単位

マイルストーン「SDF volume」。

| Issue | 内容 | 依存 | 状態 |
|---|---|---|---|
| — | Blender Extension に KTX2 の出力を足す（別リポジトリ） | なし | 未着手 |
| [#71](https://github.com/kramhash/frapx/issues/71) | core に 3D データテクスチャ（fx-canvas / fx-passes）を足す | fx-canvas 1.0（#70） | 未着手 |
| [#72](https://github.com/kramhash/frapx/issues/72) | `@frapx/glsl-sdf-volume` を新設し、`examples/vite-sdf-volume` でレイマーチする | #71。実物の素材は KTX2 の出力が前提 | 未着手 |
| [#73](https://github.com/kramhash/frapx/issues/73) | fx-particles の `sdf`（引き寄せ・衝突・出現）と react-particles | #72 | 未着手 |
