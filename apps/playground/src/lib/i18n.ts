/** UI strings in English and Japanese (growth plan decision 24). */

export type Language = "en" | "ja";

export const LANGUAGES: readonly Language[] = ["en", "ja"];

const en = {
  title: "frapx playground",
  starter: "Starter",
  custom: "Custom",
  shareUrl: "Copy share URL",
  shareCopied: "Link copied",
  copyFailed: "Copy failed",
  language: "Language",
  docs: "Docs",
  privacy: "Privacy",
  editor: "GLSL editor",
  preview: "Preview",
  uniforms: "Uniforms",
  install: "Install",
  installTabs: "Install code",
  copy: "Copy",
  copied: "Copied",
  copiedStatus: "Copied to the clipboard",
  emptyPanel: ["Add ", " or ", " after a uniform to get a control."],
  badShare: "Couldn't open the shared link, so the default starter is shown.",
  unknownSnippet: (name: string) => `Unknown snippet "${name}"`,
  openFile: "Open file…",
  retry: "Retry",
  volumeLoading: "Loading…",
  volumeMissing: (file: string) => `Open ${file} to show it here.`,
  useSample: (label: string) => `Use ${label}`,
  volumeError: (message: string) => `Couldn't load the volume: ${message}`,
  unknownSample: (value: string) => `No sample named "${value}".`,
  notSdfFile: "Choose a .sdf.ktx2 file baked with 3dsdf-texture.",
  dismiss: "Dismiss"
};

export type Messages = { readonly [K in keyof typeof en]: (typeof en)[K] };

const ja: Messages = {
  title: "frapx playground",
  starter: "スターター",
  custom: "カスタム",
  shareUrl: "共有 URL をコピー",
  shareCopied: "コピーしました",
  copyFailed: "コピーできませんでした",
  language: "言語",
  docs: "ドキュメント",
  privacy: "プライバシー",
  editor: "GLSL エディタ",
  preview: "プレビュー",
  uniforms: "パラメーター",
  install: "導入コード",
  installTabs: "導入コード",
  copy: "コピー",
  copied: "コピーしました",
  copiedStatus: "クリップボードにコピーしました",
  emptyPanel: ["uniform 宣言の行末に ", " や ", " を書くと、ここに操作パネルが出ます。"],
  badShare: "共有リンクを読み込めなかったので、既定のスターターを表示しています。",
  unknownSnippet: (name: string) => `「${name}」というスニペットはありません`,
  openFile: "ファイルを開く…",
  retry: "再試行",
  volumeLoading: "読み込み中…",
  volumeMissing: (file: string) => `${file} を開くと、ここに表示されます。`,
  useSample: (label: string) => `${label} を使う`,
  volumeError: (message: string) => `ボリュームを読み込めませんでした: ${message}`,
  unknownSample: (value: string) => `「${value}」というサンプルはありません。`,
  notSdfFile: "3dsdf-texture で焼いた .sdf.ktx2 のファイルを選んでください。",
  dismiss: "閉じる"
};

export const messages: Readonly<Record<Language, Messages>> = { en, ja };

export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = { en: "English", ja: "日本語" };

/** Japanese for a `ja` browser language, English otherwise. */
export const detectLanguage = (browserLanguages: readonly string[]): Language =>
  browserLanguages[0]?.toLowerCase().startsWith("ja") ? "ja" : "en";

export const isLanguage = (value: unknown): value is Language => value === "en" || value === "ja";
