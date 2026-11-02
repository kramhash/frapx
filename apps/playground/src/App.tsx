import { useEffect, useRef } from "react";
import { createShaderBackground, glsl } from "@frapx/fx-canvas";

// Placeholder starter until the editor lands (#91). The preview drives the
// runtime directly instead of through @frapx/react-canvas so the editor can
// swap shaders with setFragment() without remounting (growth plan decision 17).
const fragment = glsl`
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float wave = 0.5 + 0.5 * sin(uv.x * 10.0 + u_time);
    gl_FragColor = vec4(uv.x, uv.y * wave, 0.6 + 0.4 * wave, 1.0);
  }
`;

export default function App() {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = previewRef.current;
    if (target === null) return;
    const fx = createShaderBackground({ target, fragment });
    return () => fx.destroy();
  }, []);

  return (
    <main className="app">
      <header className="topbar">
        <h1>frapx playground</h1>
      </header>
      <div ref={previewRef} className="preview" aria-hidden="true" />
    </main>
  );
}
