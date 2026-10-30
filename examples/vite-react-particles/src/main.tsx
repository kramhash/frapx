import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { glsl } from "@frapx/fx-canvas";
import {
  keyframes,
  presets,
  type ParticlePresetName,
  type ShaderStatus,
  type UniformSource
} from "@frapx/fx-particles";
import { ShaderBackground } from "@frapx/react-canvas";
import { Particles, type ParticlesHandle } from "@frapx/react-particles";
import "./styles.css";

// A dark gradient for the particles to sit on. Each layer has its own canvas;
// the particle canvas is transparent and stacked over this one with CSS.
const fragment = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float drift = 0.5 + 0.5 * sin(u_time * 0.2 + uv.x * 2.0);
  vec3 top = vec3(0.02, 0.04, 0.09);
  vec3 bottom = mix(vec3(0.05, 0.09, 0.16), vec3(0.09, 0.05, 0.14), drift);
  gl_FragColor = vec4(mix(bottom, top, uv.y), 1.0);
}
`;

const PRESETS = Object.keys(presets) as ParticlePresetName[];

// keyframes() holds its last key, so the source wraps time to loop it.
const breatheKeys = keyframes(
  { opacity: [[0, 1], [2, 0.15], [4, 1]] },
  { ease: "smooth" }
);
const breathe: UniformSource = { get: (time) => breatheKeys.get(time % 4) };

const presetRate = (preset: ParticlePresetName): number => presets[preset].rate ?? 20;

const App = () => {
  const particlesRef = useRef<ParticlesHandle>(null);
  const [preset, setPreset] = useState<ParticlePresetName>("snow");
  const [rate, setRate] = useState(() => presetRate("snow"));
  const [breathing, setBreathing] = useState(false);
  const [status, setStatus] = useState<ShaderStatus>("idle");

  // The E2E tests drive the instance through the handle.
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as typeof window & { __frapxParticles?: unknown }).__frapxParticles = particlesRef;
    }
  }, []);

  return (
    <main className="app">
      <ShaderBackground className="layer" fragment={fragment} />
      {/* rate changes in place; preset changes, or a rate the pool cannot hold, recreate. */}
      <Particles
        ref={particlesRef}
        className="layer"
        data-testid="particles"
        preset={preset}
        rate={rate}
        uniformSources={breathing ? [breathe] : undefined}
        onStatusChange={setStatus}
      />
      <section className="panel" aria-label="Particle controls">
        <div>
          <p className="eyebrow">React binding</p>
          <h1>@frapx/react-particles</h1>
        </div>
        <label className="control">
          <span>Preset</span>
          <select
            value={preset}
            onChange={(event) => {
              const next = event.currentTarget.value as ParticlePresetName;
              setPreset(next);
              setRate(presetRate(next));
            }}
          >
            {PRESETS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>Rate: {rate} / s</span>
          <input
            type="range"
            min="0"
            max="200"
            step="1"
            value={rate}
            onChange={(event) => setRate(Number(event.currentTarget.value))}
          />
        </label>
        <label className="control toggle">
          <input
            type="checkbox"
            checked={breathing}
            onChange={(event) => setBreathing(event.currentTarget.checked)}
          />
          <span>Breathe (keyframed opacity)</span>
        </label>
        <div className="actions">
          <button type="button" onClick={() => particlesRef.current?.stop()}>
            Stop
          </button>
          <button type="button" onClick={() => particlesRef.current?.start()}>
            Start
          </button>
          <button type="button" onClick={() => particlesRef.current?.reset()}>
            Reset
          </button>
        </div>
        {/* Follows the runtime live: paused while offscreen, hidden or under reduced motion. */}
        <p className="control" data-testid="particles-status">
          Status: {status}
        </p>
      </section>
    </main>
  );
};

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
