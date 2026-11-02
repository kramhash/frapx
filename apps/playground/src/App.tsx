import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InstallCode } from "./components/InstallCode";
import { UniformPanel } from "./components/UniformPanel";
import { useCodeMirror } from "./hooks/useCodeMirror";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useLanguage } from "./hooks/useLanguage";
import { usePreview } from "./hooks/usePreview";
import { useShareHash } from "./hooks/useShareHash";
import { useUniformValues } from "./hooks/useUniformValues";
import { parseControls } from "./lib/annotations";
import { generateInstallCode } from "./lib/codegen";
import { isLanguage, LANGUAGE_NAMES, LANGUAGES, messages } from "./lib/i18n";
import { expandIncludes } from "./lib/include";
import { encodeShare } from "./lib/share";
import type { SharedState } from "./lib/share";
import { snippets } from "./lib/snippets";
import { defaultStarter, starters } from "./lib/starters";

const lookup = (name: string) => snippets.get(name)?.source;

const CUSTOM = "custom";

type CopyState = "idle" | "copied" | "failed";

export default function App() {
  const editorRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [language, setLanguage] = useLanguage();
  const t = messages[language];

  const [starterId, setStarterId] = useState<string>(defaultStarter.id);
  // `loaded` is what the editor is told to show (a new object even for the
  // same text, so re-picking a starter resets edits); `source` follows typing.
  const [loaded, setLoaded] = useState({ text: defaultStarter.source });
  const [source, setSource] = useState(defaultStarter.source);
  const [badShare, setBadShare] = useState(false);
  const [shareState, setShareState] = useState<CopyState>("idle");

  const compiled = useDebouncedValue(source, 250);
  const expanded = useMemo(() => expandIncludes(compiled, lookup), [compiled]);
  const controls = useMemo(() => parseControls(compiled), [compiled]);
  const [values, uniformActions] = useUniformValues(controls);
  const problems = usePreview(previewRef, compiled, expanded, values);
  const installCode = useMemo(
    () =>
      generateInstallCode({ source: compiled, controls, values, snippets, versions: __FRAPX_VERSIONS__ }),
    [compiled, controls, values]
  );

  const onChange = useCallback((value: string) => setSource(value), []);
  useCodeMirror(editorRef, loaded, onChange, problems);

  const load = useCallback((text: string, id: string) => {
    setStarterId(id);
    setLoaded({ text });
    setSource(text);
  }, []);

  const restore = useCallback(
    (shared: SharedState) => {
      const starter = starters.find((candidate) => candidate.source === shared.source);
      load(shared.source, starter?.id ?? CUSTOM);
      uniformActions.restore(shared.source, shared.values);
    },
    [load, uniformActions]
  );
  const unreadable = useCallback(() => setBadShare(true), []);
  // Only a settled state goes into the hash, never one still debouncing.
  const settled = useMemo<SharedState | null>(
    () => (compiled === source ? { source: compiled, values } : null),
    [compiled, source, values]
  );
  useShareHash(settled, restore, unreadable);

  useEffect(() => {
    if (shareState === "idle") return;
    const id = window.setTimeout(() => setShareState("idle"), 1500);
    return () => window.clearTimeout(id);
  }, [shareState]);

  const copyShareUrl = () => {
    void encodeShare({ source, values })
      .then((hash) =>
        navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}${hash}`)
      )
      .then(
        () => setShareState("copied"),
        () => setShareState("failed")
      );
  };

  const pickStarter = (id: string) => {
    const starter = starters.find((candidate) => candidate.id === id);
    if (starter !== undefined) load(starter.source, starter.id);
  };

  const shareLabel =
    shareState === "copied" ? t.shareCopied : shareState === "failed" ? t.copyFailed : t.shareUrl;

  return (
    <main className="app">
      <header className="topbar">
        <h1>{t.title}</h1>
        <label className="field">
          <span>{t.starter}</span>
          <select value={starterId} onChange={(event) => pickStarter(event.target.value)}>
            {starterId === CUSTOM && (
              <option value={CUSTOM} disabled>
                {t.custom}
              </option>
            )}
            {starters.map((starter) => (
              <option key={starter.id} value={starter.id}>
                {starter.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button" onClick={copyShareUrl}>
          {shareLabel}
        </button>
        <span className="visually-hidden" role="status">
          {shareState === "idle" ? "" : shareLabel}
        </span>
        <div className="topbar-end">
          <label className="field">
            <span className="visually-hidden">{t.language}</span>
            <select
              value={language}
              onChange={(event) => {
                if (isLanguage(event.target.value)) setLanguage(event.target.value);
              }}
            >
              {LANGUAGES.map((id) => (
                <option key={id} value={id} lang={id}>
                  {LANGUAGE_NAMES[id]}
                </option>
              ))}
            </select>
          </label>
          <a className="docs-link" href={language === "ja" ? "/frapx/ja/getting-started/" : "/frapx/"}>
            {t.docs}
          </a>
        </div>
      </header>
      {badShare && (
        <div className="notice" role="alert">
          <span>{t.badShare}</span>
          <button type="button" className="button" onClick={() => setBadShare(false)}>
            {t.dismiss}
          </button>
        </div>
      )}
      <div className="workspace">
        <section ref={editorRef} className="editor" aria-label={t.editor} />
        <div className="side">
          <section ref={previewRef} className="preview" aria-label={t.preview} />
          <div className="panel">
            <section className="panel-uniforms" aria-labelledby="uniforms-heading">
              <h2 id="uniforms-heading">{t.uniforms}</h2>
              <UniformPanel controls={controls} values={values} onChange={uniformActions.set} t={t} />
            </section>
            <section className="panel-install" aria-labelledby="install-heading">
              <h2 id="install-heading">{t.install}</h2>
              <InstallCode code={installCode} t={t} />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
