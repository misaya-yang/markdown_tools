import type { ReaderSettings } from "./types";

const SETTINGS_KEY = "marklens-settings";

export const defaultSettings: ReaderSettings = {
  theme: "day",
  font: "system",
  width: "comfort",
  retention: "balanced",
  previewZoom: 100,
};

function normalizeTheme(theme: unknown): ReaderSettings["theme"] {
  if (theme === "night") return "night";
  if (theme === "sage") return "sage";
  return "day";
}

export function readSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      theme: normalizeTheme(parsed.theme),
    };
  } catch {
    return defaultSettings;
  }
}

export function writeSettings(settings: ReaderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
