import { useCallback, useMemo, useRef, useState } from "react";
import { InstallCode } from "./components/InstallCode";
import { UniformPanel } from "./components/UniformPanel";
import { useCodeMirror } from "./hooks/useCodeMirror";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { usePreview } from "./hooks/usePreview";
import { useUniformValues } from "./hooks/useUniformValues";
import { parseControls } from "./lib/annotations";
import { generateInstallCode } from "./lib/codegen";
import { expandIncludes } from "./lib/include";
import { snippets } from "./lib/snippets";
import { defaultStarter, starters } from "./lib/starters";

const lookup = (name: string) => snippets.get(name)?.source;

export default function App() {
  const editorRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [starterId, setStarterId] = useState(defaultStarter.id);
  // `loaded` is what the editor is told to show (a new object even for the
  // same text, so re-picking a starter resets edits); `source` follows typing.
  const [loaded, setLoaded] = useState({ text: defaultStarter.source });
  const [source, setSource] = useState(defaultStarter.source);

  const compiled = useDebouncedValue(source, 250);
  const expanded = useMemo(() => expandIncludes(compiled, lookup), [compiled]);
  const controls = useMemo(() => parseControls(compiled), [compiled]);
  const [values, setValue] = useUniformValues(controls);
  const problems = usePreview(previewRef, compiled, expanded, values);
  const installCode = useMemo(
    () =>
      generateInstallCode({ source: compiled, controls, values, snippets, versions: __FRAPX_VERSIONS__ }),
    [compiled, controls, values]
  );

  const onChange = useCallback((value: string) => setSource(value), []);
  useCodeMirror(editorRef, loaded, onChange, problems);

  const pickStarter = (id: string) => {
    const starter = starters.find((candidate) => candidate.id === id);
    if (starter === undefined) return;
    setStarterId(id);
    setLoaded({ text: starter.source });
    setSource(starter.source);
  };

  return (
    <main className="app">
      <header className="topbar">
        <h1>frapx playground</h1>
        <label className="starter">
          <span>Starter</span>
          <select value={starterId} onChange={(event) => pickStarter(event.target.value)}>
            {starters.map((starter) => (
              <option key={starter.id} value={starter.id}>
                {starter.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="workspace">
        <section ref={editorRef} className="editor" aria-label="GLSL editor" />
        <div className="side">
          <section ref={previewRef} className="preview" aria-label="Preview" />
          <aside className="panel">
            <section aria-labelledby="uniforms-heading">
              <h2 id="uniforms-heading">Uniforms</h2>
              <UniformPanel controls={controls} values={values} onChange={setValue} />
            </section>
            <section aria-labelledby="install-heading">
              <h2 id="install-heading">Install</h2>
              <InstallCode code={installCode} />
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
