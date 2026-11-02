import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { StreamLanguage } from "@codemirror/language";
import { shader } from "@codemirror/legacy-modes/mode/clike";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import { basicSetup, EditorView } from "codemirror";
import type { EditorProblem } from "../lib/errors";

const theme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "var(--bg)", color: "var(--text)" },
    ".cm-scroller": { fontFamily: "var(--mono)", fontSize: "13px", lineHeight: "1.55" },
    ".cm-gutters": {
      backgroundColor: "var(--bg)",
      color: "var(--text-muted)",
      borderRight: "1px solid var(--border)"
    },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgba(255 255 255 / 0.04)" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "var(--text)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(96 165 250 / 0.3)"
    }
  },
  { dark: true }
);

/**
 * Mounts a GLSL editor into `parent`. `loaded.text` replaces the document
 * whenever a new `loaded` object arrives (a starter was picked); typing reports through
 * `onChange` without echoing back. `problems` show as lint diagnostics.
 */
export function useCodeMirror(
  parent: RefObject<HTMLElement | null>,
  loaded: { readonly text: string },
  onChange: (value: string) => void,
  problems: readonly EditorProblem[]
): void {
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const element = parent.current;
    if (element === null) return;
    const editor = new EditorView({
      parent: element,
      doc: "",
      extensions: [
        basicSetup,
        StreamLanguage.define(shader),
        lintGutter(),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        })
      ]
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [parent]);

  useEffect(() => {
    const editor = view.current;
    if (editor === null) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: loaded.text } });
  }, [loaded]);

  useEffect(() => {
    const editor = view.current;
    if (editor === null) return;
    const doc = editor.state.doc;
    const diagnostics: Diagnostic[] = problems.map(({ line, message }) => {
      const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
      return { from: target.from, to: target.to, severity: "error", message };
    });
    editor.dispatch(setDiagnostics(editor.state, diagnostics));
  }, [problems]);
}
