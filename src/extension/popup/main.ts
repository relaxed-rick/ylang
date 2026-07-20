import { browserApi } from "../shared/browserApi";
import { getSettings, saveSettings } from "../shared/settings";
import { findLanguageOption, formatLanguageName } from "../../core/languages";
import "./styles.css";

const videoToggle = document.querySelector<HTMLButtonElement>("#toggle-video");
const readingToggle = document.querySelector<HTMLButtonElement>("#toggle-reading");
const sourceLanguageSelect = document.querySelector<HTMLSelectElement>("#popup-source-language");
const targetLanguageSelect = document.querySelector<HTMLSelectElement>("#popup-target-language");

void renderSettings();

document.querySelector("#open-options")?.addEventListener("click", () => {
  void browserApi.runtime?.openOptionsPage?.();
});

document.querySelector("#open-learned-items")?.addEventListener("click", () => {
  const url = browserApi.runtime?.getURL?.("src/extension/options/index.html#learning");
  if (url) {
    void browserApi.tabs?.create?.({ url });
  } else {
    void browserApi.runtime?.openOptionsPage?.();
  }
});

videoToggle?.addEventListener("click", () => {
  void toggleMode("videoModeEnabled");
});

readingToggle?.addEventListener("click", () => {
  void toggleMode("readingModeEnabled");
});

sourceLanguageSelect?.addEventListener("change", () => {
  void updateLanguage("sourceLanguage", sourceLanguageSelect.value);
});

targetLanguageSelect?.addEventListener("change", () => {
  void updateLanguage("targetLanguage", targetLanguageSelect.value);
});

async function toggleMode(key: "videoModeEnabled" | "readingModeEnabled"): Promise<void> {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    [key]: !settings[key]
  });
  await renderSettings();
}

async function renderSettings(): Promise<void> {
  const settings = await getSettings();
  document.documentElement.style.setProperty("--ylang-popup-ui-color", normalizeColor(settings.videoUiColor));
  renderToggle(videoToggle, settings.videoModeEnabled);
  renderToggle(readingToggle, settings.readingModeEnabled);
  renderLanguageSelects(settings);
}

async function updateLanguage(key: "sourceLanguage" | "targetLanguage", value: string): Promise<void> {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    [key]: value
  });
  await renderSettings();
}

function renderLanguageSelects(settings: Awaited<ReturnType<typeof getSettings>>): void {
  const favorites = settings.favoriteLanguageCodes.filter((code) => Boolean(findLanguageOption(code)));
  if (sourceLanguageSelect) {
    const sourceCodes = settings.sourceLanguage !== "auto" && !favorites.includes(settings.sourceLanguage)
      ? [settings.sourceLanguage, ...favorites]
      : favorites;
    sourceLanguageSelect.innerHTML = [
      `<option value="auto">${formatLanguageName("auto", true)}</option>`,
      ...sourceCodes.map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(formatLanguageName(code))}</option>`)
    ].join("");
    sourceLanguageSelect.value = settings.sourceLanguage === "auto" || sourceCodes.includes(settings.sourceLanguage)
      ? settings.sourceLanguage
      : "auto";
  }
  if (targetLanguageSelect) {
    const targetCodes = settings.targetLanguage && !favorites.includes(settings.targetLanguage)
      ? [settings.targetLanguage, ...favorites]
      : favorites;
    targetLanguageSelect.innerHTML = targetCodes
      .map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(formatLanguageName(code))}</option>`)
      .join("");
    targetLanguageSelect.value = targetCodes.includes(settings.targetLanguage)
      ? settings.targetLanguage
      : targetCodes[0] ?? settings.targetLanguage;
  }
}

function renderToggle(button: HTMLButtonElement | null, enabled: boolean): void {
  if (!button) {
    return;
  }

  button.classList.toggle("enabled", enabled);
  button.setAttribute("aria-pressed", String(enabled));
  const state = button.querySelector("strong");
  if (state) {
    state.textContent = enabled ? "On" : "Off";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeColor(value: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#f4c461";
}
