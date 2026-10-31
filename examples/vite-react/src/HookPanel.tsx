import { useState } from "react";
import { useShaderBackground } from "@frapx/react-canvas";
import { glsl, hexToRgb } from "@frapx/fx-canvas";

const fragment = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_accent;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float bands = 0.5 + 0.5 * sin(uv.x * 12.0 - u_time * 2.0);
  vec3 color = mix(vec3(0.04, 0.05, 0.08), u_accent, bands * uv.y);
  gl_FragColor = vec4(color, 1.0);
}
`;

const accents = ["#f472b6", "#a3e635", "#facc15", "#38bdf8"];

// Defined once so the hook never sees a new uniforms object; the button below
// changes the accent imperatively through the instance instead.
const uniforms = { accent: hexToRgb(accents[0]!) };

export const HookPanel = () => {
  const { ref, instance, status } = useShaderBackground({
    fragment,
    uniforms
  });
  const [accentIndex, setAccentIndex] = useState(0);

  const nextAccent = () => {
    const next = (accentIndex + 1) % accents.length;
    instance?.setUniform("accent", hexToRgb(accents[next]!));
    setAccentIndex(next);
  };

  return (
    <section className="panel" aria-label="Hook example">
      <div>
        <p className="eyebrow">useShaderBackground</p>
        <p className="status">
          Status: <code>{status}</code>
        </p>
      </div>
      <div ref={ref} className="hook-preview" />
      <div className="actions">
        <button type="button" onClick={nextAccent} disabled={!instance}>
          Next color
        </button>
      </div>
    </section>
  );
};
