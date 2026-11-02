import { useCallback, useEffect, useState } from "react";
import { detectLanguage, isLanguage } from "../lib/i18n";
import type { Language } from "../lib/i18n";

const STORAGE_KEY = "frapx-playground-language";

// Storage can be missing or throw (private mode, blocked site data).
const readStored = (): Language | null => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
};

const store = (language: Language) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The choice just won't survive a reload.
  }
};

/** The UI language: the saved choice, else the browser's; choosing saves it. */
export function useLanguage(): [Language, (language: Language) => void] {
  const [language, setLanguage] = useState<Language>(
    () => readStored() ?? detectLanguage(navigator.languages.length > 0 ? navigator.languages : [navigator.language])
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const choose = useCallback((next: Language) => {
    store(next);
    setLanguage(next);
  }, []);

  return [language, choose];
}
