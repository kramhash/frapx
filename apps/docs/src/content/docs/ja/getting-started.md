---
title: はじめに（日本語）
description: 自作の GLSL を @frapx/fx-canvas で本番の Web サイトに載せる最初の一歩。
---

**自分で書いたフラグメントシェーダーを、そのまま本番のサイトに載せる**。そのための土台が **[`@frapx/fx-canvas`](/frapx/packages/fx-canvas/)** です。指定した要素の中に WebGL の canvas を差し込み、サイズを合わせてシェーダーを描き続けます。ランタイムは約 11 kB（min+gzip、`@frapx/core` 込み）です。

frapx は、「フラグメントシェーダーを 1 枚載せたいだけなのに、3D エンジンまで読み込むのは重い」と感じたところから始まりました。同じ全画面のシェーダーを描くのに、three.js では約 133 kB、Babylon.js では約 45 kB かかります（min+gzip、2026-10-30 に計測。[計測の方法](https://github.com/kramhash/frapx-bench)）。

まず fx-canvas から使い始め、SDF、ノイズ、レイマーチ、マルチパス（FBO）、GPU パーティクル、書き出しといった、よく使う部品が必要になったら足していけます。部品はどれも、このリポジトリでまとめて更新しています。メッシュやモデル、ライトを使う本格的な 3D なら、three.js や Babylon.js が向いています。

本番で手間のかかる部分は fx-canvas が引き受けます。

- 画面外に出たとき・タブが非表示のときに描画を止める
- OS の「視差効果を減らす」（reduced motion）設定への対応
- SSR 中に import しても壊れない
- WebGL1 でも動く（WebGL2 のシェーダーも書ける）

このドキュメントは英語版が正です。日本語はこの入口のページだけで、各パッケージの詳しい説明は英語のページにリンクしています。

## インストール

```sh
pnpm add @frapx/fx-canvas
```

## 最小の例

```ts
import { createShaderBackground, glsl } from "@frapx/fx-canvas";

createShaderBackground({
  target: ".hero",
  fragment: glsl`
    precision highp float;

    uniform vec2 u_resolution;
    uniform vec2 u_pointerUv;
    uniform float u_time;

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float glow = 0.5 + 0.5 * sin(u_time + uv.x * 8.0);
      gl_FragColor = vec4(uv.x, u_pointerUv.y, glow, 1.0);
    }
  `,
  respectReducedMotion: true
});
```

`target` には CSS セレクターか要素を渡します。canvas はその要素の大きさに追従するので、要素には高さを付けておいてください。

`u_time`（秒）、`u_resolution`（描画バッファの px）、`u_pointerUv`（ポインター位置、0〜1）などはライブラリが毎フレーム渡します。一覧は[`@frapx/fx-canvas` のリファレンス](/frapx/packages/fx-canvas/#what-it-handles-for-you)にあります。

自分の uniform は JS 側では `u_` を付けずに、GLSL 側では `u_` を付けて書きます。

```ts
const fx = createShaderBackground({
  target: ".hero",
  fragment, // uniform float u_progress; を宣言しておく
  uniforms: { progress: 0 }
});

fx.setUniform("progress", 0.4);
```

## reduced motion への対応

`respectReducedMotion: true` を付けると、OS で「視差効果を減らす」（Windows では「アニメーション効果」をオフ）にしている人には、1 枚の静止画を表示したままにします。設定が戻れば、アニメーションも再開します。既定値は `false` です。

止めずに動きを弱めたい場合は、シェーダーで `u_reducedMotion` を読みます。このフラグを付けていなくても、値は常に渡されます（設定がオンなら 1、オフなら 0）。

```glsl
uniform float u_reducedMotion;

// 例: reduced motion のときは揺れ幅を 1 割にする
float amount = mix(1.0, 0.1, u_reducedMotion);
```

画面外に出たときと、タブが非表示のときの停止は既定で有効です（`pauseWhenOffscreen` / `pauseWhenHidden`）。自分で何かを書く必要はありません。

## React で使う

**[`@frapx/react-canvas`](/frapx/packages/react-canvas/)** を追加して、`<ShaderBackground />` コンポーネントを使います。

```sh
pnpm add @frapx/fx-canvas @frapx/react-canvas
```

```tsx
import { ShaderBackground } from "@frapx/react-canvas";
import { glsl } from "@frapx/fx-canvas";

const fragment = glsl`
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
  }
`;

export function HeroBackground() {
  return (
    <ShaderBackground
      fragment={fragment}
      respectReducedMotion
      className="hero-bg"
    />
  );
}
```

アンマウント時の後片付けはコンポーネントが行います。フックで使う `useShaderBackground()` もあります。

## Astro で使う

Astro では、コンポーネントの `<script>` の中で呼びます。`<script>` はブラウザで動くので、frontmatter（`---` の間）には書きません。frontmatter で import しても SSR は壊れませんが、そこでは何も描かれません。

```astro
<section class="hero">
  <div class="hero-content">
    <h1>Hello</h1>
  </div>
</section>

<style>
  .hero {
    min-height: 60vh;
  }
  .hero-content {
    position: relative;
    z-index: 1;
  }
</style>

<script>
  import { createShaderBackground, glsl } from "@frapx/fx-canvas";

  createShaderBackground({
    target: ".hero",
    fragment: glsl`
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
      }
    `,
    respectReducedMotion: true
  });
</script>
```

canvas は `.hero` の最初の子として、`position: absolute; z-index: 0` で差し込まれます。文字などの中身は、上の `.hero-content` のように `position: relative; z-index: 1` を付けて canvas の上に出します。

## 次に読むもの（英語）

- 実際に動いているところ: [Live Demo](/frapx/live-demo/)
- frapx で作った作品: [Showcase](/frapx/showcase/)
- オプションと API の全体: [`@frapx/fx-canvas`](/frapx/packages/fx-canvas/)
- 自分のシェーダーにノイズやフローマップを足す: [`@frapx/glsl-noise`](/frapx/packages/glsl-noise/)、[`@frapx/glsl-flowmap`](/frapx/packages/glsl-flowmap/)
- SDF とレイマーチング: [`@frapx/glsl-sdf`](/frapx/packages/glsl-sdf/)、[`@frapx/glsl-raymarch`](/frapx/packages/glsl-raymarch/)
- どのパッケージを使えばいいか: トップページの[早見表](/frapx/#quick-decision-table)
- 英語版の Getting Started: [Getting Started](/frapx/getting-started/)
