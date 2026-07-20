import type { YlangSettings } from "../../core/types";
import { browserApi } from "./browserApi";

const SETTINGS_KEY = "ylang:settings";

export const defaultSettings: YlangSettings = {
  sourceLanguage: "nb",
  targetLanguage: "en",
  provider: "deepl-web",
  overlayMode: "ylang-controlled",
  fontScale: 1,
  verticalOffset: 0,
  videoModeEnabled: true,
  readingModeEnabled: false,
  showOriginalLine: true,
  showTranslatedLine: true,
  transcriptModeEnabled: false,
  translateOnPause: false,
  retranslateNonScriptOnPause: false,
  deepLPinToTop: true,
  deepLFocusOnUpdate: true,
  deepLWindowPreset: "top-left-detached",
  deepLWindowXPercent: 5,
  deepLWindowYPercent: 5,
  deepLScreenId: "primary",
  microsoftTranslatorKey: "",
  microsoftTranslatorRegion: "",
  localLlmEnabled: false,
  localLlmBaseUrl: "http://127.0.0.1:11434/v1",
  localLlmModel: "",
  localLlmApiKey: "",
  localLlmLaunchCommand: "",
  localLlmDebugEnabled: false,
  llmResultAutoCloseSeconds: 10,
  otherResultAutoCloseSeconds: 0,
  promptTemplates: {},
  videoUiColor: "#f4c461",
  textUiColor: "#f4c461",
  favoriteLanguageCodes: ["en-GB", "de", "fr", "nb"],
  translateShortcut: "t",
  learnShortcut: "l",
  grammarShortcut: "g",
  selectShortcut: "Space",
  clearSelectionShortcut: "d",
  maxPhraseGapWords: 2,
  captureScreenshotOnLearn: false,
  captureAudioOnLearn: false,
  audioStartBufferMs: 250,
  audioEndBufferMs: 900,
  ankiDeckPrefix: "ylang",
  ankiDeckLanguageSuffixes: {},
  saveAttemptsEnabled: true
};

export async function getSettings(): Promise<YlangSettings> {
  const stored = await browserApi.storage?.local?.get(SETTINGS_KEY);
  const storedSettings = (stored?.[SETTINGS_KEY] as (Partial<YlangSettings> & { ankiDeckName?: string }) | undefined) ?? {};
  const settings = {
    ...defaultSettings,
    ...storedSettings
  };
  return {
    ...settings,
    sourceLanguage: normalizeLanguage(settings.sourceLanguage),
    targetLanguage: normalizeLanguage(settings.targetLanguage),
    provider: normalizeProvider(settings.provider),
    deepLWindowPreset: normalizeDeepLWindowPreset(settings.deepLWindowPreset),
    deepLWindowXPercent: normalizePercent(settings.deepLWindowXPercent, defaultSettings.deepLWindowXPercent),
    deepLWindowYPercent: normalizePercent(settings.deepLWindowYPercent, defaultSettings.deepLWindowYPercent),
    deepLScreenId: normalizeScreenId(settings.deepLScreenId),
    ankiDeckPrefix: normalizeAnkiDeckPrefix(settings.ankiDeckPrefix ?? storedSettings.ankiDeckName),
    ankiDeckLanguageSuffixes: normalizeAnkiDeckLanguageSuffixes(settings.ankiDeckLanguageSuffixes)
  };
}

export async function saveSettings(settings: YlangSettings): Promise<void> {
  await browserApi.storage?.local?.set({ [SETTINGS_KEY]: settings });
}

function normalizeProvider(provider: unknown): YlangSettings["provider"] {
  return provider === "microsoft-translator" || provider === "local-llm"
    ? provider
    : "deepl-web";
}

function normalizeLanguage(language: string): string {
  return language === "no" ? "nb" : language;
}

function normalizeDeepLWindowPreset(preset: unknown): YlangSettings["deepLWindowPreset"] {
  return preset === "custom" ||
    preset === "top-left-attached" ||
    preset === "top-right-attached" ||
    preset === "bottom-right-attached" ||
    preset === "bottom-left-attached" ||
    preset === "top-left-detached" ||
    preset === "top-right-detached" ||
    preset === "bottom-right-detached" ||
    preset === "bottom-left-detached"
    ? preset
    : defaultSettings.deepLWindowPreset;
}

function normalizePercent(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : fallback;
}

function normalizeScreenId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "primary";
}

function normalizeAnkiDeckPrefix(deckPrefix: string | undefined): string {
  const normalized = deckPrefix?.replace(/\s+/g, " ").trim();
  return normalized || defaultSettings.ankiDeckPrefix;
}

function normalizeAnkiDeckLanguageSuffixes(suffixes: unknown): Record<string, string> {
  if (!suffixes || typeof suffixes !== "object" || Array.isArray(suffixes)) {
    return {};
  }

  return Object.fromEntries(Object.entries(suffixes)
    .map(([language, suffix]) => [language, typeof suffix === "string" ? suffix.replace(/\s+/g, " ").trim() : ""])
    .filter(([, suffix]) => Boolean(suffix)));
}
