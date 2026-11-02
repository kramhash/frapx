import { useEffect, useState } from "react";
import { INSTALL_TABS } from "../lib/codegen";
import type { InstallTab } from "../lib/codegen";

const LABELS: Record<InstallTab, string> = {
  html: "HTML",
  vanilla: "Vanilla",
  react: "React",
  astro: "Astro"
};

type Props = { readonly code: Readonly<Record<InstallTab, string>> };

/** The generated install code, one tab per setup, with a copy button. */
export function InstallCode({ code }: Props) {
  const [tab, setTab] = useState<InstallTab>("html");
  const [copied, setCopied] = useState<InstallTab | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const id = window.setTimeout(() => setCopied(null), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = () => {
    navigator.clipboard.writeText(code[tab]).then(
      () => setCopied(tab),
      () => setCopied(null)
    );
  };

  return (
    <div className="install">
      <div className="tabs" role="tablist" aria-label="Install code">
        {INSTALL_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`install-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="install-code"
            className="tab"
            onClick={() => setTab(id)}
          >
            {LABELS[id]}
          </button>
        ))}
        <button type="button" className="copy" onClick={copy}>
          {copied === tab ? "Copied" : "Copy"}
        </button>
      </div>
      <pre id="install-code" role="tabpanel" aria-labelledby={`install-tab-${tab}`} className="code" tabIndex={0}>
        <code>{code[tab]}</code>
      </pre>
    </div>
  );
}
