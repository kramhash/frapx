import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { INSTALL_TABS } from "../lib/codegen";
import type { InstallTab } from "../lib/codegen";
import type { Messages } from "../lib/i18n";

const LABELS: Record<InstallTab, string> = {
  html: "HTML",
  vanilla: "Vanilla",
  react: "React",
  astro: "Astro"
};

type Props = { readonly code: Readonly<Record<InstallTab, string>>; readonly t: Messages };

/** The generated install code, one tab per setup, with a copy button. */
export function InstallCode({ code, t }: Props) {
  const [tab, setTab] = useState<InstallTab>("html");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const tabRefs = useRef<Partial<Record<InstallTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (copyState === "idle") return;
    const id = window.setTimeout(() => setCopyState("idle"), 1500);
    return () => window.clearTimeout(id);
  }, [copyState]);

  const copy = () => {
    navigator.clipboard.writeText(code[tab]).then(
      () => setCopyState("copied"),
      () => setCopyState("failed")
    );
  };

  // WAI-ARIA tabs: arrow keys, Home and End move between tabs.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = INSTALL_TABS.indexOf(tab);
    const last = INSTALL_TABS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % INSTALL_TABS.length
        : event.key === "ArrowLeft"
          ? (index + last) % INSTALL_TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const id = INSTALL_TABS[next]!;
    setTab(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div className="install">
      <div className="tabs-row">
      <div className="tabs" role="tablist" aria-label={t.installTabs}>
        {INSTALL_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`install-tab-${id}`}
            ref={(element) => {
              tabRefs.current[id] = element;
            }}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            aria-controls="install-code"
            className="tab"
            onClick={() => setTab(id)}
            onKeyDown={onTabKeyDown}
          >
            {LABELS[id]}
          </button>
        ))}
      </div>
        <button type="button" className="copy" onClick={copy}>
          {copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : t.copy}
        </button>
        <span className="visually-hidden" role="status">
          {copyState === "copied" ? t.copiedStatus : copyState === "failed" ? t.copyFailed : ""}
        </span>
      </div>
      <pre id="install-code" role="tabpanel" aria-labelledby={`install-tab-${tab}`} className="code" tabIndex={0}>
        <code>{code[tab]}</code>
      </pre>
    </div>
  );
}
