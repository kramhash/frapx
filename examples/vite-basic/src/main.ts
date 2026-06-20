import { createShaderBackground, glsl } from "@frapx/shader";
import type { ShaderBackgroundInstance } from "@frapx/shader";
import "./styles.css";

declare global {
  interface Window {
    __frapxShaderSample?: {
      frames: number;
      pixel: number[] | null;
    };
    __frapxShader?: ShaderBackgroundInstance;
  }
}

window.__frapxShaderSample = {
  frames: 0,
  pixel: null
};

// Lets the E2E suite drive feature flags without separate fixture pages.
const params = new URLSearchParams(window.location.search);

const fragment100 = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointerUv;
uniform float u_pointerActive;
uniform float u_time;
uniform float u_progress;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float wave = sin((uv.x + u_progress) * 12.0 + u_time * 1.5) * 0.5 + 0.5;
  float pointer = smoothstep(0.35, 0.0, distance(uv, u_pointerUv)) * u_pointerActive;
  vec3 base = mix(vec3(0.03, 0.05, 0.08), vec3(0.1, 0.35, 0.5), uv.y);
  vec3 color = base + vec3(0.15, 0.45, 0.55) * wave + vec3(0.7, 0.9, 1.0) * pointer;
  gl_FragColor = vec4(color, 1.0);
}
`;

const fragment300 = glsl`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_pointerUv;
uniform float u_pointerActive;
uniform float u_time;
uniform float u_progress;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float wave = sin((uv.x + u_progress) * 12.0 + u_time * 1.5) * 0.5 + 0.5;
  float pointer = smoothstep(0.35, 0.0, distance(uv, u_pointerUv)) * u_pointerActive;
  vec3 base = mix(vec3(0.03, 0.05, 0.08), vec3(0.1, 0.35, 0.5), uv.y);
  vec3 color = base + vec3(0.15, 0.45, 0.55) * wave + vec3(0.7, 0.9, 1.0) * pointer;
  fragColor = vec4(color, 1.0);
}
`;

const fragment = params.get("webgl2") === "1" ? fragment300 : fragment100;

const fx = createShaderBackground({
  target: "[data-hero]",
  fragment,
  uniforms: {
    progress: 0
  },
  debug: true,
  respectReducedMotion: params.get("reducedMotion") === "1",
  onAfterRender({ gl, width, height }) {
    const pixel = new Uint8Array(4);
    gl.readPixels(
      Math.floor(width / 2),
      Math.floor(height / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel
    );
    window.__frapxShaderSample = {
      frames: (window.__frapxShaderSample?.frames ?? 0) + 1,
      pixel: Array.from(pixel)
    };
  }
});

window.__frapxShader = fx;

const progress = document.querySelector<HTMLInputElement>("[data-progress]");
progress?.addEventListener("input", () => {
  fx.setUniform("progress", Number(progress.value));
});
