import { StrictMode, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ShaderBackground,
  type ShaderBackgroundHandle
} from "@frapx/react-canvas";
import { glsl, hexToRgb, type UniformSource } from "@frapx/fx-canvas";
import { HookPanel } from "./HookPanel";
import "./styles.css";

const fragment = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointerUv;
uniform float u_time;
uniform float u_intensity;
uniform vec3 u_accent;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = uv - 0.5;
  float wave = sin((p.x * 8.0) + (p.y * 5.0) + u_time * 1.4);
  float glow = smoothstep(0.7, 0.05, length(p - (u_pointerUv - 0.5)));
  vec3 base = mix(vec3(0.03, 0.04, 0.06), u_accent, 0.35 + 0.35 * wave);
  vec3 color = base + glow * u_accent * u_intensity;
  gl_FragColor = vec4(color, 1.0);
}
`;

// Overrides the slider's intensity while bound; unbinding hands it back.
const pulse: UniformSource = {
  get: (time) => ({ intensity: 0.75 + 0.75 * Math.sin(time * 2) })
};

const App = () => {
  const shaderRef = useRef<ShaderBackgroundHandle>(null);
  const [intensity, setIntensity] = useState(0.75);
  const [pulsing, setPulsing] = useState(false);
  const uniforms = useMemo(
    () => ({
      intensity,
      accent: hexToRgb("#38bdf8")
    }),
    [intensity]
  );

  return (
    <main className="app">
      <ShaderBackground
        ref={shaderRef}
        className="shader"
        fragment={fragment}
        uniforms={uniforms}
        uniformSources={pulsing ? [pulse] : undefined}
      />
      <section className="panel" aria-label="Shader controls">
        <div>
          <p className="eyebrow">React binding</p>
          <h1>@frapx/react-canvas</h1>
        </div>
        <label className="control">
          <span>Intensity</span>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.01"
            value={intensity}
            onChange={(event) => setIntensity(Number(event.currentTarget.value))}
          />
        </label>
        <label className="control">
          <span>Pulse</span>
          <input
            type="checkbox"
            checked={pulsing}
            onChange={(event) => setPulsing(event.currentTarget.checked)}
          />
        </label>
        <div className="actions">
          <button type="button" onClick={() => shaderRef.current?.stop()}>
            Stop
          </button>
          <button type="button" onClick={() => shaderRef.current?.start()}>
            Start
          </button>
        </div>
      </section>
      <HookPanel />
    </main>
  );
};

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
