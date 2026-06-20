import { createShaderBackground, glsl, hexToRgb } from "@frapx/shader";
import "./styles.css";

const fragment = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointerUv;
uniform float u_pointerActive;
uniform float u_time;
uniform float u_decay;
uniform float u_flow;
uniform vec3 u_accent;
uniform sampler2D u_previousFrame;

float ring(vec2 uv, vec2 center, float radius, float width) {
  return smoothstep(width, 0.0, abs(distance(uv, center) - radius));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = uv - 0.5;

  vec2 drift = vec2(
    sin((uv.y + u_time * 0.08) * 12.0),
    cos((uv.x - u_time * 0.06) * 10.0)
  ) * 0.0045 * u_flow;

  vec4 history = texture2D(u_previousFrame, uv + drift) * u_decay;
  float pointer = smoothstep(0.24, 0.0, distance(uv, u_pointerUv)) * u_pointerActive;
  float pulse = 0.5 + 0.5 * sin(u_time * 1.6);
  vec2 seedCenter = vec2(
    0.5 + sin(u_time * 0.23) * 0.18,
    0.5 + cos(u_time * 0.19) * 0.14
  );
  float seed = ring(uv, seedCenter, 0.14 + pulse * 0.035, 0.035) * 0.1;

  vec3 ink = u_accent * (pointer * 0.8 + seed);
  vec3 veil = vec3(0.018, 0.016, 0.025) + u_accent * 0.025;
  vec3 color = max(history.rgb, ink);

  gl_FragColor = vec4(max(color, veil), 1.0);
}
`;

const stage = document.querySelector<HTMLElement>("[data-stage]")!;
const decay = document.querySelector<HTMLInputElement>("[data-decay]")!;
const flow = document.querySelector<HTMLInputElement>("[data-flow]")!;
const decayOutput = document.querySelector<HTMLOutputElement>(
  "[data-decay-output]"
)!;
const flowOutput = document.querySelector<HTMLOutputElement>("[data-flow-output]")!;
const status = document.querySelector<HTMLElement>("[data-status]")!;
const toggle = document.querySelector<HTMLButtonElement>("[data-toggle]")!;
const swatches = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-color]")
);

let running = true;

const shader = createShaderBackground({
  target: stage,
  fragment,
  feedback: true,
  uniforms: {
    decay: Number(decay.value),
    flow: Number(flow.value),
    accent: hexToRgb("#22d3ee")
  },
  debug: true
});

const updateDecay = () => {
  const value = Number(decay.value);
  decayOutput.value = value.toFixed(3);
  shader.setUniform("decay", value);
};

const updateFlow = () => {
  const value = Number(flow.value);
  flowOutput.value = value.toFixed(2);
  shader.setUniform("flow", value);
};

decay.addEventListener("input", updateDecay);
flow.addEventListener("input", updateFlow);

for (const swatch of swatches) {
  swatch.style.setProperty("--swatch-color", swatch.dataset.color ?? "#22d3ee");
  swatch.addEventListener("click", () => {
    const color = swatch.dataset.color ?? "#22d3ee";
    shader.setUniform("accent", hexToRgb(color));
    for (const item of swatches) {
      item.classList.toggle("is-active", item === swatch);
    }
  });
}

toggle.addEventListener("click", () => {
  running = !running;
  if (running) shader.start();
  else shader.stop();
  status.textContent = running ? "Running" : "Paused";
  status.classList.toggle("is-paused", !running);
  toggle.textContent = running ? "Pause" : "Resume";
});

updateDecay();
updateFlow();
