import { parseHexColor, toHexColor } from "../lib/annotations";
import type { ColorControl, Control, RangeControl } from "../lib/annotations";
import type { Messages } from "../lib/i18n";
import type { UniformValues } from "../lib/uniforms";

type Props = {
  readonly controls: readonly Control[];
  readonly values: UniformValues;
  readonly onChange: (control: Control, value: readonly number[]) => void;
  readonly t: Messages;
};

const AXES = ["x", "y", "z", "w"];

const formatSlider = (value: number, step: number): string => {
  const decimals = Math.min(4, Math.max(0, Math.ceil(-Math.log10(step))));
  return value.toFixed(decimals);
};

function RangeRow({
  control,
  value,
  onChange
}: {
  control: RangeControl;
  value: readonly number[];
  onChange: Props["onChange"];
}) {
  return (
    <div className="control">
      <span className="control-name">{control.name}</span>
      <div className="control-inputs">
      {value.map((component, index) => {
        const label = value.length > 1 ? `${control.name}.${AXES[index]}` : control.name;
        return (
          <label key={index} className="slider">
            {value.length > 1 && <span className="axis">{AXES[index]}</span>}
            <input
              type="range"
              aria-label={label}
              min={control.min}
              max={control.max}
              step={control.step}
              value={component}
              onChange={(event) => {
                const next = [...value];
                next[index] = Number(event.target.value);
                onChange(control, next);
              }}
            />
            <output>{formatSlider(component, control.step)}</output>
          </label>
        );
      })}
      </div>
    </div>
  );
}

function ColorRow({
  control,
  value,
  onChange
}: {
  control: ColorControl;
  value: readonly number[];
  onChange: Props["onChange"];
}) {
  return (
    <div className="control">
      <span className="control-name">{control.name}</span>
      <div className="control-inputs">
      <label className="slider">
        <input
          type="color"
          aria-label={control.name}
          value={toHexColor(value)}
          onChange={(event) => {
            const rgb = parseHexColor(event.target.value);
            if (rgb === null) return;
            onChange(control, control.type === "vec4" ? [...rgb, value[3] ?? 1] : rgb);
          }}
        />
        <output>{toHexColor(value)}</output>
      </label>
      {control.type === "vec4" && (
        <label className="slider">
          <span className="axis">a</span>
          <input
            type="range"
            aria-label={`${control.name} alpha`}
            min={0}
            max={1}
            step={0.01}
            value={value[3] ?? 1}
            onChange={(event) => onChange(control, [...value.slice(0, 3), Number(event.target.value)])}
          />
          <output>{(value[3] ?? 1).toFixed(2)}</output>
        </label>
      )}
      </div>
    </div>
  );
}

/** One slider (or color picker) per annotated uniform. */
export function UniformPanel({ controls, values, onChange, t }: Props) {
  if (controls.length === 0) {
    return (
      <p className="panel-empty">
        {t.emptyPanel[0]}
        <code>// @range 0 1 @default 0.5</code>
        {t.emptyPanel[1]}
        <code>// @color @default #ff8800</code>
        {t.emptyPanel[2]}
      </p>
    );
  }
  return (
    <div className="controls">
      {controls.map((control) => {
        const value = values[control.name] ?? control.defaults;
        return control.kind === "range" ? (
          <RangeRow key={control.name} control={control} value={value} onChange={onChange} />
        ) : (
          <ColorRow key={control.name} control={control} value={value} onChange={onChange} />
        );
      })}
    </div>
  );
}
