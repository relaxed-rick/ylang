import type {
  LearningItem,
  LearningItemIndexItem,
  OverlayMode,
  SavedTranscriptIndexItem,
  SavedTranscriptRecord,
  PromptTemplateKey,
  PromptTemplateMap,
  SourceLanguage,
  TargetLanguage,
  TranslationProvider
} from "../../core/types";
import {
  defaultFavoriteLanguageCodes,
  findLanguageOption,
  formatLanguageName,
  languageOptions,
  sourceLanguageOptions,
  type LanguageOption
} from "../../core/languages";
import { defaultPromptTemplates, promptTemplateDefinitions } from "../../core/promptTemplates";
import { sha256 } from "../../core/text";
import { browserApi } from "../shared/browserApi";
import { getSettings, saveSettings } from "../shared/settings";
import "./styles.css";

const SAVED_TRANSCRIPT_INDEX_KEY = "ylang:saved-transcripts:index";
const LEARNING_INDEX_KEY = "ylang:learning-items:index";
const LEARNING_COLLECTIONS_KEY = "ylang:learning-collections:index";
const DEFAULT_ANKI_DECK_PREFIX = "ylang";
const ANKI_MODEL_NAME = "ylang Subtitle Card";
const LLM_DEBUG_LAST_KEY = "ylang:llm-debug:last";

const form = document.querySelector<HTMLFormElement>("#settings-form");
const settingsPage = document.querySelector<HTMLElement>("#settings-page");
const llmSetupPage = document.querySelector<HTMLElement>("#llm-setup-page");
const promptSettingsPage = document.querySelector<HTMLElement>("#prompt-settings-page");
const learningPage = document.querySelector<HTMLElement>("#learning-page");
const attemptsPage = document.querySelector<HTMLElement>("#attempts-page");
const statusNode = document.querySelector<HTMLElement>("#status");
const llmStatusSummary = document.querySelector<HTMLElement>("#llm-status-summary");
const llmSetupSummary = document.querySelector<HTMLElement>("#llm-setup-summary");
const llmChecklist = document.querySelector<HTMLElement>("#llm-checklist");
const llmSetupStatus = document.querySelector<HTMLElement>("#llm-setup-status");
const llmModelSuggestion = document.querySelector<HTMLSelectElement>("#llm-model-suggestion");
const llmExtensionOrigin = document.querySelector<HTMLInputElement>("#llm-extension-origin");
const llmOriginCommand = document.querySelector<HTMLInputElement>("#llm-origin-command");
const llmPullCommand = document.querySelector<HTMLInputElement>("#llm-pull-command");
const llmLaunchCommand = document.querySelector<HTMLInputElement>("#llm-launch-command");
const llmLaunchIncludeOrigin = document.querySelector<HTMLInputElement>("#llm-launch-include-origin");
const llmSetxCommand = document.querySelector<HTMLTextAreaElement>("#llm-setx-command");
const llmDebugOutput = document.querySelector<HTMLTextAreaElement>("#llm-debug-output");
const savedTranscriptsList = document.querySelector<HTMLElement>("#saved-transcripts-list");
const savedTranscriptsStatus = document.querySelector<HTMLElement>("#saved-transcripts-status");
const learningItemsList = document.querySelector<HTMLElement>("#learning-items-list");
const learningItemsStatus = document.querySelector<HTMLElement>("#learning-items-status");
const learningLanguageFilter = document.querySelector<HTMLSelectElement>("#learning-language-filter");
const learningSort = document.querySelector<HTMLSelectElement>("#learning-sort");
const learningSelectAll = document.querySelector<HTMLInputElement>("#learning-select-all");
const learningSetName = document.querySelector<HTMLInputElement>("#learning-set-name");
const learningNewSetName = document.querySelector<HTMLInputElement>("#learning-new-set-name");
const learningMoveTarget = document.querySelector<HTMLSelectElement>("#learning-move-target");
const learningImportBackupFile = document.querySelector<HTMLInputElement>("#learning-import-backup-file");
const attemptsList = document.querySelector<HTMLElement>("#attempts-list");
const attemptsStatus = document.querySelector<HTMLElement>("#attempts-status");
const llmResultAutoCloseValue = document.querySelector<HTMLOutputElement>("#llm-result-autoclose-value");
const otherResultAutoCloseValue = document.querySelector<HTMLOutputElement>("#other-result-autoclose-value");
const promptTemplateList = document.querySelector<HTMLElement>("#prompt-template-list");
const promptSettingsStatus = document.querySelector<HTMLElement>("#prompt-settings-status");
const favoriteLanguagePicker = document.querySelector<HTMLSelectElement>("#favorite-language-picker");
const favoriteLanguageTags = document.querySelector<HTMLElement>("#favorite-language-tags");
const ankiDeckExample = document.querySelector<HTMLElement>("#anki-deck-example");
const ylangTitle = document.querySelector<HTMLElement>("#ylang-title");
const ylangEasterEgg = document.querySelector<HTMLElement>("#ylang-easter-egg");
const deeplPlacementPresets: Record<string, { x: number; y: number }> = {
  "top-left-attached": { x: 0, y: 0 },
  "top-right-attached": { x: 100, y: 0 },
  "bottom-right-attached": { x: 100, y: 100 },
  "bottom-left-attached": { x: 0, y: 100 },
  "top-left-detached": { x: 5, y: 5 },
  "top-right-detached": { x: 95, y: 5 },
  "bottom-right-detached": { x: 95, y: 95 },
  "bottom-left-detached": { x: 5, y: 95 }
};
let favoriteLanguageCodesDraft: string[] = [...defaultFavoriteLanguageCodes];
let settingsSaveTimer: number | undefined;
let titleClickCount = 0;
let ankiSyncInProgress = false;
let selectedLearningCollection = "";
let selectedLearningSort: LearningSortMode = "updated-desc";
let visibleLearningItemIds: string[] = [];
let selectedLearningItemIds = new Set<string>();
let lastSelectedLearningIndex: number | undefined;

type LearningPageKind = "learned" | "attempt";
type LearningSortMode = "updated-desc" | "updated-asc" | "alpha" | "language";

type LearningCollection = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type LearningBackup = {
  kind: "ylang-learning-backup";
  version: number;
  exportedAt?: string;
  learningIndex?: LearningItemIndexItem[];
  learningCollections?: LearningCollection[];
  learningItems?: LearningItem[];
};

type LlmCheckStatus = "pass" | "fail" | "warn";

type LlmCheck = {
  label: string;
  status: LlmCheckStatus;
  detail: string;
};

type LocalLlmProbeResult = {
  summary: string;
  checks: LlmCheck[];
  models: string[];
  loadedModels: string[];
};

type AnkiUpsertResult = {
  noteId: number;
  action: "created" | "updated";
};

void init();

async function init(): Promise<void> {
  if (!form) {
    return;
  }

  const settings = await getSettings();
  selectedLearningCollection = createDefaultLearningCollectionId(settings.sourceLanguage);
  favoriteLanguageCodesDraft = normalizeFavoriteLanguageCodes(settings.favoriteLanguageCodes);
  populateLanguageSelect(getField("sourceLanguage"), sourceLanguageOptions, { includeAuto: true });
  populateLanguageSelect(getField("targetLanguage"), languageOptions);
  populateFavoriteLanguagePicker();
  renderFavoriteLanguageTags();
  getField("sourceLanguage").value = settings.sourceLanguage;
  getField("targetLanguage").value = settings.targetLanguage;
  ensureSelectValue(getField("sourceLanguage"), settings.sourceLanguage);
  ensureSelectValue(getField("targetLanguage"), settings.targetLanguage);
  getField("provider").value = settings.provider;
  getField("overlayMode").value = settings.overlayMode;
  getField("fontScale").value = String(settings.fontScale);
  getField("verticalOffset").value = String(settings.verticalOffset);
  getField("llmResultAutoCloseSeconds").value = String(settings.llmResultAutoCloseSeconds);
  getField("otherResultAutoCloseSeconds").value = String(settings.otherResultAutoCloseSeconds);
  getField("videoUiColor").value = normalizeColor(settings.videoUiColor, "#f4c461");
  getField("textUiColor").value = normalizeColor(settings.textUiColor, "#f4c461");
  syncAutoCloseOutputs();
  getCheckbox("translateOnPause").checked = settings.translateOnPause;
  getCheckbox("retranslateNonScriptOnPause").checked = settings.retranslateNonScriptOnPause;
  getCheckbox("deepLPinToTop").checked = settings.deepLPinToTop;
  getCheckbox("deepLFocusOnUpdate").checked = settings.deepLFocusOnUpdate;
  getField("deepLWindowPreset").value = settings.deepLWindowPreset;
  getField("deepLWindowXPercent").value = String(settings.deepLWindowXPercent);
  getField("deepLWindowYPercent").value = String(settings.deepLWindowYPercent);
  await populateDeepLScreenSelect(settings.deepLScreenId);
  getField("microsoftTranslatorKey").value = settings.microsoftTranslatorKey;
  getField("microsoftTranslatorRegion").value = settings.microsoftTranslatorRegion;
  getCheckbox("localLlmEnabled").checked = settings.localLlmEnabled;
  getField("localLlmBaseUrl").value = settings.localLlmBaseUrl;
  getField("localLlmModel").value = settings.localLlmModel;
  getField("localLlmApiKey").value = settings.localLlmApiKey;
  getField("localLlmLaunchCommand").value = settings.localLlmLaunchCommand;
  getCheckbox("localLlmDebugEnabled").checked = settings.localLlmDebugEnabled;
  getField("translateShortcut").value = displayShortcut(settings.translateShortcut);
  getField("learnShortcut").value = displayShortcut(settings.learnShortcut);
  getField("grammarShortcut").value = displayShortcut(settings.grammarShortcut);
  getField("selectShortcut").value = displayShortcut(settings.selectShortcut);
  if (llmLaunchCommand) {
    llmLaunchCommand.value = settings.localLlmLaunchCommand;
  }
  syncOllamaOriginFields();
  renderPromptTemplateEditors(settings.promptTemplates);
  getField("maxPhraseGapWords").value = String(settings.maxPhraseGapWords);
  getField("ankiDeckPrefix").value = settings.ankiDeckPrefix;
  getCheckbox("saveAttemptsEnabled").checked = settings.saveAttemptsEnabled;
  getField("clearSelectionShortcut").value = displayShortcut(settings.clearSelectionShortcut);
  updateAnkiDeckExample(settings.ankiDeckLanguageSuffixes);

  installSettingsAutoSave();
  installEasterEgg();

  document.querySelector("#llm-configure")?.addEventListener("click", () => {
    showLlmSetupPage();
    void refreshLocalLlmStatus();
  });
  document.querySelector("#llm-refresh")?.addEventListener("click", () => {
    void refreshLocalLlmStatus();
  });
  document.querySelector("#llm-setup-refresh")?.addEventListener("click", () => {
    void refreshLocalLlmStatus();
  });
  document.querySelector("#llm-debug-refresh")?.addEventListener("click", () => {
    void renderLlmDebugRecord();
  });
  document.querySelector("#llm-debug-copy")?.addEventListener("click", () => {
    void copyText(llmDebugOutput?.value ?? "", "Copied LLM debug record.");
  });
  document.querySelector("#llm-debug-clear")?.addEventListener("click", () => {
    void clearLlmDebugRecord();
  });
  document.querySelector("#llm-back")?.addEventListener("click", showSettingsPage);
  document.querySelector("#prompt-settings-open")?.addEventListener("click", showPromptSettingsPage);
  document.querySelector("#prompt-settings-back")?.addEventListener("click", showSettingsPage);
  document.querySelector("#prompt-settings-save")?.addEventListener("click", () => {
    void savePromptSettings();
  });
  document.querySelector("#prompt-settings-reset")?.addEventListener("click", () => {
    renderPromptTemplateEditors(defaultPromptTemplates);
    setPromptSettingsStatus("Restored defaults in the editor. Save to apply them.");
  });
  document.querySelector("#learning-open")?.addEventListener("click", showLearningPage);
  document.querySelector("#attempts-open")?.addEventListener("click", showAttemptsPage);
  document.querySelector("#learning-back")?.addEventListener("click", showSettingsPage);
  document.querySelector("#attempts-back")?.addEventListener("click", showSettingsPage);
  document.querySelector("#learning-refresh")?.addEventListener("click", () => {
    void renderLearningItems().then(() => setLearningItemsStatus("Refreshed learned items."));
  });
  document.querySelector("#attempts-refresh")?.addEventListener("click", () => {
    void renderAttemptItems().then(() => setAttemptsStatus("Refreshed attempts."));
  });
  document.querySelector("#learning-delete-all")?.addEventListener("click", () => {
    void deleteSelectedLearningItems();
  });
  document.querySelector("#attempts-delete-all")?.addEventListener("click", () => {
    void deleteAllLearningItems("attempt");
  });
  document.querySelector("#learning-export-anki")?.addEventListener("click", () => {
    void exportLearningItemsToAnki();
  });
  document.querySelector("#learning-export-backup")?.addEventListener("click", () => {
    void exportLearningBackup();
  });
  document.querySelector("#learning-import-backup")?.addEventListener("click", () => {
    learningImportBackupFile?.click();
  });
  learningImportBackupFile?.addEventListener("change", () => {
    const file = learningImportBackupFile.files?.[0];
    learningImportBackupFile.value = "";
    if (file) {
      void importLearningBackup(file);
    }
  });
  document.querySelector("#learning-clear-translations")?.addEventListener("click", () => {
    void clearSelectedLearningTranslations();
  });
  document.querySelector("#learning-rename-set")?.addEventListener("click", () => {
    void renameSelectedLearningCollection();
  });
  document.querySelector("#learning-create-set")?.addEventListener("click", () => {
    void createCustomLearningCollection();
  });
  document.querySelector("#learning-move-selected")?.addEventListener("click", () => {
    void moveSelectedLearningItems();
  });
  document.querySelector("#learning-complete-microsoft")?.addEventListener("click", () => {
    void completeEmptyLearningTranslations("microsoft-translator");
  });
  document.querySelector("#learning-complete-llm")?.addEventListener("click", () => {
    void completeEmptyLearningTranslations("local-llm");
  });
  document.querySelector("#llm-use-ollama")?.addEventListener("click", useOllamaDefaults);
  document.querySelector("#llm-copy-origin")?.addEventListener("click", () => {
    void copyText(llmOriginCommand?.value ?? "", "Copied Ollama origin variable.");
  });
  document.querySelector("#llm-copy-pull")?.addEventListener("click", () => {
    void copyText(llmPullCommand?.value ?? "", "Copied Ollama pull command.");
  });
  document.querySelector("#llm-copy-launch")?.addEventListener("click", () => {
    const command = createLaunchCommandForClipboard();
    void copyText(command, "Copied launch command.");
  });
  document.querySelector("#llm-apply-model")?.addEventListener("click", applySuggestedModel);
  llmModelSuggestion?.addEventListener("change", syncSuggestedModelCommand);
  llmLaunchCommand?.addEventListener("input", () => {
    getField("localLlmLaunchCommand").value = llmLaunchCommand.value;
    scheduleSettingsSave();
  });
  getField("llmResultAutoCloseSeconds").addEventListener("input", syncAutoCloseOutputs);
  getField("otherResultAutoCloseSeconds").addEventListener("input", syncAutoCloseOutputs);
  favoriteLanguagePicker?.addEventListener("change", () => {
    addFavoriteLanguage(favoriteLanguagePicker.value);
    favoriteLanguagePicker.value = "";
  });
  getField("ankiDeckPrefix").addEventListener("input", () => {
    updateAnkiDeckExample();
    scheduleSettingsSave();
  });
  getField("targetLanguage").addEventListener("change", () => updateAnkiDeckExample());
  getCheckbox("saveAttemptsEnabled").addEventListener("change", () => scheduleSettingsSave());
  getField("deepLWindowPreset").addEventListener("change", applyDeepLPlacementPreset);
  getField("deepLWindowXPercent").addEventListener("input", markDeepLPlacementCustom);
  getField("deepLWindowYPercent").addEventListener("input", markDeepLPlacementCustom);
  favoriteLanguageTags?.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>("[data-remove-favorite-language]")
      : null;
    if (button?.dataset.removeFavoriteLanguage) {
      removeFavoriteLanguage(button.dataset.removeFavoriteLanguage);
    }
  });
  installFirstLetterSelectJump(getField("sourceLanguage"));
  installFirstLetterSelectJump(getField("targetLanguage"));

  savedTranscriptsList?.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>("button") : null;
    const id = button?.dataset.transcriptId;
    if (!button || !id) {
      return;
    }

    if (button.dataset.action === "copy-transcript") {
      void copySavedTranscript(id);
    } else if (button.dataset.action === "delete-transcript") {
      void deleteSavedTranscript(id);
    }
  });

  learningItemsList?.addEventListener("click", handleLearningSelectionClick, true);
  learningItemsList?.addEventListener("click", (event) => {
    void handleLearningListClick(event);
  });

  attemptsList?.addEventListener("click", (event) => {
    void handleLearningListClick(event);
  });
  learningLanguageFilter?.addEventListener("change", () => {
    selectedLearningCollection = learningLanguageFilter.value;
    void renderLearningItems();
  });
  learningSort?.addEventListener("change", () => {
    selectedLearningSort = normalizeLearningSortMode(learningSort.value);
    void renderLearningItems();
  });
  learningSelectAll?.addEventListener("change", () => {
    setVisibleLearningSelection(Boolean(learningSelectAll.checked));
    syncLearningSelectionControl();
    renderVisibleLearningCheckboxes();
  });

  syncSuggestedModelCommand();
  routeFromHash();
  window.addEventListener("hashchange", routeFromHash);
  await refreshLocalLlmStatus();
  await renderLlmDebugRecord();
  await renderSavedTranscripts();
  await renderLearningItems();
  await renderAttemptItems();
}

async function handleLearningListClick(event: Event): Promise<void> {
    const button = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>("button") : null;
    const id = button?.dataset.learningId;
    if (!button || !id) {
      return;
    }

    if (button.dataset.action === "save-learning") {
      void saveLearningEdits(id);
    } else if (button.dataset.action === "delete-learning") {
      void deleteLearningItem(id);
    } else if (button.dataset.action === "clear-learning-translation") {
      void clearLearningTranslation(id);
    } else if (button.dataset.action === "delete-learning-media") {
      const mediaId = button.dataset.mediaId;
      if (mediaId) {
        void deleteLearningMedia(id, mediaId);
      }
    }
}

function handleLearningSelectionClick(event: MouseEvent): void {
  const checkbox = event.target instanceof HTMLElement
    ? event.target.closest<HTMLInputElement>("input[data-learning-select]")
    : null;
  if (!checkbox) {
    return;
  }

  event.stopPropagation();
  window.setTimeout(() => {
    const id = checkbox.dataset.learningSelect;
    const index = Number(checkbox.dataset.learningIndex);
    if (!id || !Number.isFinite(index)) {
      return;
    }

    setLearningSelectionAt(index, id, checkbox.checked, event.shiftKey);
    syncLearningSelectionControl();
    renderVisibleLearningCheckboxes();
  }, 0);
}

function setLearningSelectionAt(index: number, id: string, isSelected: boolean, useRange: boolean): void {
  if (useRange && lastSelectedLearningIndex !== undefined) {
    const start = Math.min(lastSelectedLearningIndex, index);
    const end = Math.max(lastSelectedLearningIndex, index);
    visibleLearningItemIds.slice(start, end + 1).forEach((rangeId) => {
      if (isSelected) {
        selectedLearningItemIds.add(rangeId);
      } else {
        selectedLearningItemIds.delete(rangeId);
      }
    });
  } else if (isSelected) {
    selectedLearningItemIds.add(id);
  } else {
    selectedLearningItemIds.delete(id);
  }

  lastSelectedLearningIndex = index;
}

async function handleSave(): Promise<void> {
  if (!form) {
    return;
  }

  const existing = await getSettings();
  await saveSettings({
    sourceLanguage: getField("sourceLanguage").value as SourceLanguage,
    targetLanguage: getField("targetLanguage").value as TargetLanguage,
    provider: getField("provider").value as TranslationProvider,
    overlayMode: getField("overlayMode").value as OverlayMode,
    fontScale: Number(getField("fontScale").value),
    verticalOffset: Number(getField("verticalOffset").value),
    llmResultAutoCloseSeconds: normalizeAutoCloseSeconds(getField("llmResultAutoCloseSeconds").value),
    otherResultAutoCloseSeconds: normalizeAutoCloseSeconds(getField("otherResultAutoCloseSeconds").value),
    videoUiColor: normalizeColor(getField("videoUiColor").value, "#f4c461"),
    textUiColor: normalizeColor(getField("textUiColor").value, "#f4c461"),
    videoModeEnabled: existing.videoModeEnabled,
    readingModeEnabled: existing.readingModeEnabled,
    showOriginalLine: existing.showOriginalLine,
    showTranslatedLine: existing.showTranslatedLine,
    transcriptModeEnabled: existing.transcriptModeEnabled,
    translateOnPause: getCheckbox("translateOnPause").checked,
    retranslateNonScriptOnPause: getCheckbox("retranslateNonScriptOnPause").checked,
    deepLPinToTop: getCheckbox("deepLPinToTop").checked,
    deepLFocusOnUpdate: getCheckbox("deepLFocusOnUpdate").checked,
    deepLWindowPreset: getField("deepLWindowPreset").value as typeof existing.deepLWindowPreset,
    deepLWindowXPercent: normalizePercentInput(getField("deepLWindowXPercent").value, existing.deepLWindowXPercent),
    deepLWindowYPercent: normalizePercentInput(getField("deepLWindowYPercent").value, existing.deepLWindowYPercent),
    deepLScreenId: getField("deepLScreenId").value || "primary",
    microsoftTranslatorKey: getField("microsoftTranslatorKey").value.trim(),
    microsoftTranslatorRegion: getField("microsoftTranslatorRegion").value.trim(),
    localLlmEnabled: getCheckbox("localLlmEnabled").checked,
    localLlmBaseUrl: normalizeBaseUrl(getField("localLlmBaseUrl").value),
    localLlmModel: getField("localLlmModel").value.trim(),
    localLlmApiKey: getField("localLlmApiKey").value.trim(),
    localLlmLaunchCommand: getField("localLlmLaunchCommand").value.trim(),
    localLlmDebugEnabled: getCheckbox("localLlmDebugEnabled").checked,
    promptTemplates: existing.promptTemplates,
    favoriteLanguageCodes: favoriteLanguageCodesDraft,
    translateShortcut: normalizeShortcut(getField("translateShortcut").value, "t"),
    learnShortcut: normalizeShortcut(getField("learnShortcut").value, "l"),
    grammarShortcut: normalizeShortcut(getField("grammarShortcut").value, "g"),
    selectShortcut: normalizeShortcut(getField("selectShortcut").value, "Space"),
    clearSelectionShortcut: normalizeShortcut(getField("clearSelectionShortcut").value, "d"),
    maxPhraseGapWords: Number(getField("maxPhraseGapWords").value),
    captureScreenshotOnLearn: false,
    captureAudioOnLearn: false,
    audioStartBufferMs: existing.audioStartBufferMs,
    audioEndBufferMs: existing.audioEndBufferMs,
    ankiDeckPrefix: normalizeAnkiDeckPrefix(getField("ankiDeckPrefix").value),
    ankiDeckLanguageSuffixes: existing.ankiDeckLanguageSuffixes,
    saveAttemptsEnabled: getCheckbox("saveAttemptsEnabled").checked
  });

  if (statusNode) {
    statusNode.textContent = "Saved automatically.";
  }
}

async function populateDeepLScreenSelect(selectedScreenId: string): Promise<void> {
  const screenSelect = getField("deepLScreenId");
  if (!(screenSelect instanceof HTMLSelectElement)) {
    return;
  }

  const displays = await getDeepLDisplays();
  const options = [
    { id: "primary", label: "Primary screen" },
    ...displays.map((display, index) => ({
      id: display.id,
      label: `${display.isPrimary ? "Primary" : `Screen ${index + 1}`} (${display.width}x${display.height})`
    }))
  ];

  screenSelect.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`)
    .join("");
  screenSelect.value = options.some((option) => option.id === selectedScreenId) ? selectedScreenId : "primary";
}

async function getDeepLDisplays(): Promise<Array<{ id: string; isPrimary: boolean; width: number; height: number }>> {
  try {
    const response = await browserApi.runtime?.sendMessage?.({ type: "ylang:deepl.displays" }) as {
      ok?: boolean;
      displays?: Array<{ id?: string; isPrimary?: boolean; width?: number; height?: number }>;
    } | undefined;
    if (!response?.ok || !response.displays) {
      return [];
    }

    return response.displays
      .map((display) => ({
        id: display.id ?? "",
        isPrimary: Boolean(display.isPrimary),
        width: Number(display.width),
        height: Number(display.height)
      }))
      .filter((display) => display.id && Number.isFinite(display.width) && Number.isFinite(display.height));
  } catch {
    return [];
  }
}

function applyDeepLPlacementPreset(): void {
  const preset = getField("deepLWindowPreset").value;
  const coordinates = deeplPlacementPresets[preset];
  if (!coordinates) {
    scheduleSettingsSave();
    return;
  }

  getField("deepLWindowXPercent").value = String(coordinates.x);
  getField("deepLWindowYPercent").value = String(coordinates.y);
  scheduleSettingsSave();
}

function markDeepLPlacementCustom(): void {
  getField("deepLWindowPreset").value = "custom";
  scheduleSettingsSave();
}

function normalizePercentInput(value: string, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : fallback;
}

function installSettingsAutoSave(): void {
  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    scheduleSettingsSave(0);
  });

  form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((field) => {
    const eventName = field instanceof HTMLInputElement && field.type !== "checkbox" ? "input" : "change";
    field.addEventListener(eventName, () => {
      if (field instanceof HTMLInputElement && field.dataset.shortcutInput === "true") {
        field.value = displayShortcut(normalizeShortcut(field.value, ""));
      }
      scheduleSettingsSave();
    });
  });

  if (statusNode) {
    statusNode.textContent = "Changes save automatically.";
  }
}

function installEasterEgg(): void {
  ylangTitle?.addEventListener("click", () => {
    titleClickCount += 1;
    if (titleClickCount >= 7 && ylangEasterEgg) {
      ylangEasterEgg.hidden = false;
    }
  });
}

function scheduleSettingsSave(delayMs = 250): void {
  if (settingsSaveTimer) {
    window.clearTimeout(settingsSaveTimer);
  }

  settingsSaveTimer = window.setTimeout(() => {
    settingsSaveTimer = undefined;
    void handleSave();
  }, delayMs);
}

function showLlmSetupPage(): void {
  if (settingsPage) {
    settingsPage.hidden = true;
  }
  if (llmSetupPage) {
    llmSetupPage.hidden = false;
  }
  if (learningPage) {
    learningPage.hidden = true;
  }
  if (promptSettingsPage) {
    promptSettingsPage.hidden = true;
  }
  if (attemptsPage) {
    attemptsPage.hidden = true;
  }
  if (window.location.hash !== "#llm-setup") {
    window.location.hash = "llm-setup";
  }
}

function showLearningPage(): void {
  if (settingsPage) {
    settingsPage.hidden = true;
  }
  if (llmSetupPage) {
    llmSetupPage.hidden = true;
  }
  if (learningPage) {
    learningPage.hidden = false;
  }
  if (promptSettingsPage) {
    promptSettingsPage.hidden = true;
  }
  if (attemptsPage) {
    attemptsPage.hidden = true;
  }
  if (window.location.hash !== "#learning") {
    window.location.hash = "learning";
  }
  void renderLearningItems();
}

function showAttemptsPage(): void {
  if (settingsPage) {
    settingsPage.hidden = true;
  }
  if (llmSetupPage) {
    llmSetupPage.hidden = true;
  }
  if (learningPage) {
    learningPage.hidden = true;
  }
  if (promptSettingsPage) {
    promptSettingsPage.hidden = true;
  }
  if (attemptsPage) {
    attemptsPage.hidden = false;
  }
  if (window.location.hash !== "#attempts") {
    window.location.hash = "attempts";
  }
  void renderAttemptItems();
}

function showSettingsPage(): void {
  if (settingsPage) {
    settingsPage.hidden = false;
  }
  if (llmSetupPage) {
    llmSetupPage.hidden = true;
  }
  if (learningPage) {
    learningPage.hidden = true;
  }
  if (promptSettingsPage) {
    promptSettingsPage.hidden = true;
  }
  if (attemptsPage) {
    attemptsPage.hidden = true;
  }
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname);
  }
}

function showPromptSettingsPage(): void {
  if (settingsPage) {
    settingsPage.hidden = true;
  }
  if (llmSetupPage) {
    llmSetupPage.hidden = true;
  }
  if (learningPage) {
    learningPage.hidden = true;
  }
  if (attemptsPage) {
    attemptsPage.hidden = true;
  }
  if (promptSettingsPage) {
    promptSettingsPage.hidden = false;
  }
  if (window.location.hash !== "#prompt-settings") {
    window.location.hash = "prompt-settings";
  }
}

function routeFromHash(): void {
  if (window.location.hash === "#llm-setup") {
    showLlmSetupPage();
  } else if (window.location.hash === "#prompt-settings") {
    showPromptSettingsPage();
  } else if (window.location.hash === "#learning") {
    showLearningPage();
  } else if (window.location.hash === "#attempts") {
    showAttemptsPage();
  } else {
    showSettingsPage();
  }
}

async function refreshLocalLlmStatus(): Promise<void> {
  const result = await probeLocalLlm();
  renderLocalLlmStatus(result);
}

async function probeLocalLlm(): Promise<LocalLlmProbeResult> {
  const enabled = getCheckbox("localLlmEnabled").checked;
  const baseUrl = normalizeBaseUrl(getField("localLlmBaseUrl").value);
  const model = getField("localLlmModel").value.trim();
  const apiKey = getField("localLlmApiKey").value.trim();
  const checks: LlmCheck[] = [
    {
      label: "Local LLM feature enabled",
      status: enabled ? "pass" : "fail",
      detail: enabled ? "Enabled in ylang settings." : "Enable the checkbox in settings when you want to use it."
    },
    {
      label: "Base URL configured",
      status: baseUrl ? "pass" : "fail",
      detail: baseUrl || "Set a local OpenAI-compatible endpoint."
    },
    {
      label: "Model configured",
      status: model ? "pass" : "fail",
      detail: model || "Set the exact model name exposed by your local runner."
    }
  ];

  if (!baseUrl) {
    return {
      summary: "Local LLM is not configured yet.",
      checks,
      models: [],
      loadedModels: []
    };
  }

  const openAiBaseUrl = normalizeOpenAiBaseUrl(baseUrl);
  const serverRoot = getServerRoot(openAiBaseUrl);
  const openAiModels = await tryReadOpenAiModels(openAiBaseUrl, apiKey);
  const ollamaModels = openAiModels.ok ? undefined : await tryReadOllamaModels(serverRoot);
  const models = openAiModels.ok ? openAiModels.models : ollamaModels?.models ?? [];
  const serverReachable = openAiModels.ok || Boolean(ollamaModels?.ok);
  const loadedModels = await tryReadOllamaLoadedModels(serverRoot);
  const modelAvailable = Boolean(model && models.some((candidate) => modelsMatch(candidate, model)));
  const modelLoaded = Boolean(model && loadedModels.some((candidate) => modelsMatch(candidate, model)));

  checks.push({
    label: "Local server reachable",
    status: serverReachable ? "pass" : "fail",
    detail: serverReachable
      ? `Connected to ${openAiModels.ok ? "OpenAI-compatible" : "Ollama"} server.`
      : "No local server answered. Start Ollama, LM Studio server, or another local runner."
  });
  checks.push({
    label: "Configured model available",
    status: modelAvailable ? "pass" : model ? "fail" : "warn",
    detail: modelAvailable
      ? `Found ${model}.`
      : models.length
        ? `Available models: ${models.slice(0, 6).join(", ")}`
        : "No model list available yet."
  });
  checks.push({
    label: "Model currently loaded",
    status: modelLoaded ? "pass" : loadedModels.length ? "warn" : "warn",
    detail: modelLoaded
      ? `${model} is loaded.`
      : "Many local runners load models on first request, so this is not always a blocker."
  });

  return {
    summary: createLocalLlmSummary(enabled, serverReachable, model, modelAvailable),
    checks,
    models,
    loadedModels
  };
}

function renderLocalLlmStatus(result: LocalLlmProbeResult): void {
  if (llmStatusSummary) {
    llmStatusSummary.textContent = result.summary;
  }
  if (llmSetupSummary) {
    llmSetupSummary.textContent = result.summary;
  }
  if (!llmChecklist) {
    return;
  }

  llmChecklist.innerHTML = result.checks
    .map(
      (check) => `
        <div class="ylang-check-row ylang-check-${check.status}">
          <span>${check.status === "pass" ? "OK" : check.status === "warn" ? "..." : "NO"}</span>
          <div>
            <strong>${escapeHtml(check.label)}</strong>
            <p>${escapeHtml(check.detail)}</p>
          </div>
        </div>
      `
    )
    .join("");
}

function createLocalLlmSummary(
  enabled: boolean,
  serverReachable: boolean,
  model: string,
  modelAvailable: boolean
): string {
  if (!enabled) {
    return "Disabled. Configure local LLM if you want grammar and local translation features.";
  }
  if (!serverReachable) {
    return "Enabled, but the local server is offline or blocked.";
  }
  if (!model) {
    return "Server reachable. Choose a model name to finish setup.";
  }
  if (!modelAvailable) {
    return "Server reachable, but the configured model was not found.";
  }
  return "Ready. Local LLM server and configured model are available.";
}

async function tryReadOpenAiModels(baseUrl: string, apiKey: string): Promise<{ ok: boolean; models: string[] }> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/models`, apiKey);
    if (!response.ok) {
      return { ok: false, models: [] };
    }

    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    return {
      ok: true,
      models: body.data?.map((model) => model.id).filter(isNonEmptyString) ?? []
    };
  } catch {
    return { ok: false, models: [] };
  }
}

async function tryReadOllamaModels(serverRoot: string): Promise<{ ok: boolean; models: string[] }> {
  try {
    const response = await fetchWithTimeout(`${serverRoot}/api/tags`);
    if (!response.ok) {
      return { ok: false, models: [] };
    }

    const body = (await response.json()) as { models?: Array<{ name?: string }> };
    return {
      ok: true,
      models: body.models?.map((model) => model.name).filter(isNonEmptyString) ?? []
    };
  } catch {
    return { ok: false, models: [] };
  }
}

async function tryReadOllamaLoadedModels(serverRoot: string): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(`${serverRoot}/api/ps`);
    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as { models?: Array<{ name?: string }> };
    return body.models?.map((model) => model.name).filter(isNonEmptyString) ?? [];
  } catch {
    return [];
  }
}

async function fetchWithTimeout(url: string, apiKey = ""): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1800);
  try {
    return await fetch(url, {
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function useOllamaDefaults(): void {
  getCheckbox("localLlmEnabled").checked = true;
  getField("provider").value = "local-llm";
  getField("localLlmBaseUrl").value = "http://127.0.0.1:11434/v1";
  getField("localLlmLaunchCommand").value = "ollama serve";
  if (llmLaunchCommand) {
    llmLaunchCommand.value = "ollama serve";
  }
  applySuggestedModel();
  void refreshLocalLlmStatus();
}

function applySuggestedModel(): void {
  const model = llmModelSuggestion?.value.trim() || "gemma4:e2b-it-q4_K_M";
  getField("localLlmModel").value = model;
  syncSuggestedModelCommand();
  setLlmSetupStatus(`Using model name ${model}. Save settings when you are done.`);
}

function syncSuggestedModelCommand(): void {
  const model = llmModelSuggestion?.value.trim() || "gemma4:e2b-it-q4_K_M";
  if (llmPullCommand) {
    llmPullCommand.value = `ollama pull ${model}`;
  }
}

function syncOllamaOriginFields(): void {
  const extensionId = browserApi.runtime?.id?.trim();
  const origin = extensionId ? `chrome-extension://${extensionId}` : "chrome-extension://PASTE_THE_EXTENSION_ID";
  if (llmExtensionOrigin) {
    llmExtensionOrigin.value = origin;
  }
  if (llmOriginCommand) {
    llmOriginCommand.value = `OLLAMA_ORIGINS=${origin}`;
  }
  if (llmSetxCommand) {
    llmSetxCommand.value = [
      `setx OLLAMA_HOST "127.0.0.1:11434"`,
      `setx OLLAMA_ORIGINS "${origin}"`
    ].join("\n");
  }
}

function createLaunchCommandForClipboard(): string {
  const command = llmLaunchCommand?.value.trim() || "ollama serve";
  if (!llmLaunchIncludeOrigin?.checked) {
    return command;
  }

  return [
    "$env:OLLAMA_HOST='127.0.0.1:11434'",
    `$env:OLLAMA_ORIGINS='${getOllamaExtensionOrigin()}'`,
    command
  ].join("; ");
}

function getOllamaExtensionOrigin(): string {
  return llmExtensionOrigin?.value.trim() || "chrome-extension://PASTE_THE_EXTENSION_ID";
}

async function renderLlmDebugRecord(): Promise<void> {
  if (!llmDebugOutput) {
    return;
  }

  const stored = await browserApi.storage?.local?.get(LLM_DEBUG_LAST_KEY);
  const record = stored?.[LLM_DEBUG_LAST_KEY];
  if (!record) {
    llmDebugOutput.value = "";
    return;
  }

  llmDebugOutput.value = JSON.stringify(record, null, 2);
}

async function clearLlmDebugRecord(): Promise<void> {
  await browserApi.storage?.local?.remove(LLM_DEBUG_LAST_KEY);
  if (llmDebugOutput) {
    llmDebugOutput.value = "";
  }
  setLlmSetupStatus("Cleared LLM debug record.");
}

async function copyText(text: string, message: string): Promise<void> {
  if (!text.trim()) {
    setLlmSetupStatus("Nothing to copy yet.");
    return;
  }

  await navigator.clipboard.writeText(text);
  setLlmSetupStatus(message);
}

function normalizeOpenAiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/g, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function getServerRoot(openAiBaseUrl: string): string {
  return openAiBaseUrl.replace(/\/v1$/u, "");
}

function modelsMatch(candidate: string, configured: string): boolean {
  return candidate === configured || candidate.replace(/:latest$/u, "") === configured;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function setLlmSetupStatus(message: string): void {
  if (llmSetupStatus) {
    llmSetupStatus.textContent = message;
  }
}

function renderPromptTemplateEditors(templates: PromptTemplateMap | undefined): void {
  if (!promptTemplateList) {
    return;
  }

  const merged = {
    ...defaultPromptTemplates,
    ...(templates ?? {})
  };
  promptTemplateList.innerHTML = promptTemplateDefinitions
    .map((definition) => `
      <label>
        ${escapeHtml(definition.label)}
        <span class="ylang-template-help">
          ${escapeHtml(definition.description)}
          ${definition.requiredPlaceholder ? ` Required once: <code>{{${escapeHtml(definition.requiredPlaceholder)}}}</code>.` : ""}
        </span>
        <textarea data-prompt-key="${escapeHtml(definition.key)}" spellcheck="false">${escapeHtml(merged[definition.key])}</textarea>
      </label>
    `)
    .join("");
}

async function savePromptSettings(): Promise<void> {
  const existing = await getSettings();
  const templates = collectPromptTemplates();
  const warnings = validatePromptTemplates(templates);
  await saveSettings({
    ...existing,
    promptTemplates: templates
  });
  if (warnings.length) {
    setPromptSettingsStatus(`Saved with warnings: ${warnings.join(" ")}`);
  } else {
    setPromptSettingsStatus("Saved prompt templates.");
  }
}

function collectPromptTemplates(): PromptTemplateMap {
  const templates: PromptTemplateMap = {};
  promptTemplateDefinitions.forEach((definition) => {
    const textarea = getPromptTextarea(definition.key);
    templates[definition.key] = textarea?.value.trim() || defaultPromptTemplates[definition.key];
  });
  return templates;
}

function validatePromptTemplates(templates: PromptTemplateMap): string[] {
  return promptTemplateDefinitions
    .map((definition) => {
      if (!definition.requiredPlaceholder) {
        return "";
      }
      const template = templates[definition.key] ?? "";
      const count = countPlaceholder(template, definition.requiredPlaceholder);
      return count === 1
        ? ""
        : `${definition.label} should include {{${definition.requiredPlaceholder}}} exactly once.`;
    })
    .filter(Boolean);
}

function countPlaceholder(template: string, placeholder: string): number {
  const pattern = new RegExp(`{{\\s*${escapeRegExp(placeholder)}\\s*}}`, "gu");
  return [...template.matchAll(pattern)].length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPromptTextarea(key: PromptTemplateKey): HTMLTextAreaElement | null {
  return promptTemplateList?.querySelector<HTMLTextAreaElement>(`textarea[data-prompt-key="${key}"]`) ?? null;
}

function setPromptSettingsStatus(message: string): void {
  if (promptSettingsStatus) {
    promptSettingsStatus.textContent = message;
  }
}

function syncAutoCloseOutputs(): void {
  if (llmResultAutoCloseValue) {
    llmResultAutoCloseValue.textContent = formatAutoCloseSeconds(getField("llmResultAutoCloseSeconds").value);
  }
  if (otherResultAutoCloseValue) {
    otherResultAutoCloseValue.textContent = formatAutoCloseSeconds(getField("otherResultAutoCloseSeconds").value);
  }
}

function normalizeAutoCloseSeconds(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  return Math.min(10, Math.max(0, Math.round(seconds)));
}

function formatAutoCloseSeconds(value: string): string {
  const seconds = normalizeAutoCloseSeconds(value);
  return seconds === 0 ? "unlimited" : `${seconds}s`;
}

function populateFavoriteLanguagePicker(): void {
  if (!favoriteLanguagePicker) {
    return;
  }

  favoriteLanguagePicker.innerHTML = [
    `<option value="">Add favorite language...</option>`,
    ...languageOptions.map((language) =>
      `<option value="${escapeHtml(language.code)}">${escapeHtml(formatLanguageOptionLabel(language))}</option>`
    )
  ].join("");
}

function renderFavoriteLanguageTags(): void {
  if (!favoriteLanguageTags) {
    return;
  }

  favoriteLanguageTags.innerHTML = favoriteLanguageCodesDraft
    .map((code) => `
      <span class="ylang-language-tag">
        ${escapeHtml(formatLanguageName(code))}
        <button type="button" aria-label="Remove ${escapeHtml(formatLanguageName(code))}" data-remove-favorite-language="${escapeHtml(code)}">x</button>
      </span>
    `)
    .join("");
}

function addFavoriteLanguage(code: string): void {
  if (!code || favoriteLanguageCodesDraft.includes(code) || !findLanguageOption(code)) {
    return;
  }
  favoriteLanguageCodesDraft = [...favoriteLanguageCodesDraft, code];
  renderFavoriteLanguageTags();
  refreshLanguageSelects();
  scheduleSettingsSave();
}

function removeFavoriteLanguage(code: string): void {
  favoriteLanguageCodesDraft = favoriteLanguageCodesDraft.filter((candidate) => candidate !== code);
  renderFavoriteLanguageTags();
  refreshLanguageSelects();
  scheduleSettingsSave();
}

function normalizeFavoriteLanguageCodes(codes: string[] | undefined): string[] {
  const source = codes?.length ? codes : defaultFavoriteLanguageCodes;
  return [...new Set(source)].filter((code) => Boolean(findLanguageOption(code)));
}

function normalizeShortcut(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.toLowerCase() === "space" ? "Space" : trimmed.slice(0, 1).toLowerCase();
}

function displayShortcut(value: string): string {
  return value.toLowerCase() === "space" ? "Space" : value.toUpperCase();
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/g, "") || "http://127.0.0.1:11434/v1";
}

function normalizeColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/iu.test(trimmed) ? trimmed : fallback;
}

function refreshLanguageSelects(): void {
  const sourceField = getField("sourceLanguage");
  const targetField = getField("targetLanguage");
  const sourceValue = sourceField.value;
  const targetValue = targetField.value;
  populateLanguageSelect(sourceField, sourceLanguageOptions, { includeAuto: true });
  populateLanguageSelect(targetField, languageOptions);
  ensureSelectValue(sourceField, sourceValue);
  ensureSelectValue(targetField, targetValue);
}

function populateLanguageSelect(
  select: HTMLSelectElement | HTMLInputElement,
  languages: LanguageOption[],
  options: { includeAuto?: boolean } = {}
): void {
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }

  const autoLanguage = options.includeAuto ? languages.find((language) => language.code === "auto") : undefined;
  const regularLanguages = languages.filter((language) => language.code !== "auto");
  const favoriteLanguages = favoriteLanguageCodesDraft
    .map((code) => findLanguageOption(code))
    .filter((language): language is LanguageOption => Boolean(language));

  select.innerHTML = [
    autoLanguage ? renderLanguageOption(autoLanguage) : "",
    favoriteLanguages.length ? `<optgroup label="Favorite languages">${favoriteLanguages.map(renderLanguageOption).join("")}</optgroup>` : "",
    `<optgroup label="All languages">${regularLanguages.map(renderLanguageOption).join("")}</optgroup>`
  ].join("");
}

function renderLanguageOption(language: LanguageOption): string {
  const providers = language.sourceOnly ? "source only" : language.providers.map(formatProviderLabel).join(", ");
  return `<option value="${escapeHtml(language.code)}">${escapeHtml(language.name)} (${escapeHtml(language.code)}) - ${escapeHtml(providers)}</option>`;
}

function formatLanguageOptionLabel(language: LanguageOption): string {
  const providers = language.sourceOnly ? "source only" : language.providers.map(formatProviderLabel).join(", ");
  return `${language.name} (${language.code}) - ${providers}`;
}

function ensureSelectValue(select: HTMLSelectElement | HTMLInputElement, value: string): void {
  if (!(select instanceof HTMLSelectElement) || !value) {
    return;
  }

  if ([...select.options].some((option) => option.value === value)) {
    select.value = value;
    return;
  }

  const option = document.createElement("option");
  option.value = value;
  option.textContent = `${value} - custom`;
  select.prepend(option);
  select.value = value;
}

function installFirstLetterSelectJump(select: HTMLSelectElement | HTMLInputElement): void {
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }

  let lastKey = "";
  let lastKeyAt = 0;
  select.addEventListener("keydown", (event) => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const key = event.key.toLocaleLowerCase();
    if (!/^[a-z]$/u.test(key)) {
      return;
    }

    const options = [...select.options];
    const selectedIndex = Math.max(0, select.selectedIndex);
    const now = Date.now();
    const startIndex = key === lastKey && now - lastKeyAt < 1200 ? selectedIndex + 1 : 0;
    const match =
      options.slice(startIndex).find((option) => option.textContent?.trim().toLocaleLowerCase().startsWith(key)) ??
      options.slice(0, startIndex).find((option) => option.textContent?.trim().toLocaleLowerCase().startsWith(key));

    if (match) {
      select.value = match.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      event.preventDefault();
    }

    lastKey = key;
    lastKeyAt = now;
  });
}

function formatProviderLabel(provider: LanguageOption["providers"][number]): string {
  return provider === "microsoft" ? "Microsoft" : "DeepL";
}

async function renderSavedTranscripts(): Promise<void> {
  if (!savedTranscriptsList) {
    return;
  }

  const index = await getSavedTranscriptIndex();
  if (!index.length) {
    savedTranscriptsList.textContent = "No saved transcripts yet.";
    setSavedTranscriptsStatus("");
    return;
  }

  savedTranscriptsList.innerHTML = index
    .map((item) => {
      const title = escapeHtml(item.title || item.sourceKey);
      const meta = escapeHtml(`${item.cueCount} lines - saved ${formatDate(item.savedAt)}`);
      return `
        <div class="ylang-transcript-row">
          <div class="ylang-transcript-meta">
            <strong>${title}</strong>
            <span>${meta}</span>
          </div>
          <button type="button" data-action="copy-transcript" data-transcript-id="${escapeHtml(item.id)}">Copy</button>
          <button type="button" data-action="delete-transcript" data-transcript-id="${escapeHtml(item.id)}">Delete</button>
        </div>
      `;
    })
    .join("");
}

async function copySavedTranscript(id: string): Promise<void> {
  const record = await getSavedTranscript(id);
  if (!record) {
    setSavedTranscriptsStatus("Saved transcript was not found.");
    await renderSavedTranscripts();
    return;
  }

  await navigator.clipboard.writeText(formatTranscript(record));
  setSavedTranscriptsStatus("Copied saved transcript.");
}

async function deleteSavedTranscript(id: string): Promise<void> {
  const index = await getSavedTranscriptIndex();
  const nextIndex = index.filter((item) => item.id !== id);
  await browserApi.storage?.local?.remove(createSavedTranscriptKey(id));
  await browserApi.storage?.local?.set({ [SAVED_TRANSCRIPT_INDEX_KEY]: nextIndex });
  setSavedTranscriptsStatus(
    nextIndex.length === index.length ? "Saved transcript was not found." : "Deleted saved transcript."
  );
  await renderSavedTranscripts();
}

async function renderLearningItems(): Promise<void> {
  if (!learningItemsList) {
    return;
  }

  const items = await getLearningItemsForPage("learned", { limit: false });
  await syncLearningControls(items);
  const visibleItems = sortLearningItems(filterLearningItemsByCollection(items));
  if (!items.length) {
    visibleLearningItemIds = [];
    selectedLearningItemIds.clear();
    syncLearningSelectionControl();
    learningItemsList.textContent = "No learning items yet.";
    setLearningItemsStatus("");
    return;
  }

  if (!visibleItems.length) {
    visibleLearningItemIds = [];
    syncLearningSelectionControl();
    learningItemsList.innerHTML = `<div class="ylang-empty-state">No learned items for this set yet.</div>`;
    setLearningItemsStatus(`Showing 0 of ${items.length} learned items.`);
    return;
  }

  visibleLearningItemIds = visibleItems.map((item) => item.id);
  selectedLearningItemIds = new Set([...selectedLearningItemIds].filter((id) => items.some((item) => item.id === id)));
  learningItemsList.innerHTML = `
    <div class="ylang-learning-table">
      ${visibleItems.map((item, index) => renderLearningItem(item, { index, selectable: true })).join("")}
    </div>
  `;
  syncLearningSelectionControl();
  setLearningItemsStatus(`Showing ${visibleItems.length} of ${items.length} learned items.`);
}

async function renderAttemptItems(): Promise<void> {
  if (!attemptsList) {
    return;
  }

  const items = await getLearningItemsForPage("attempt");
  if (!items.length) {
    attemptsList.textContent = "No attempts yet.";
    setAttemptsStatus("");
    return;
  }

  attemptsList.innerHTML = items
    .map((item, index) => renderLearningItem(item, { index, selectable: false }))
    .join("");
}

async function syncLearningControls(items: LearningItem[]): Promise<void> {
  const collections = await getLearningCollectionsForItems(items);
  if (learningLanguageFilter) {
    const selected = selectedLearningCollection || "all";
    const options = [
      `<option value="all">All sets</option>`,
      ...collections.map((collection) => `<option value="${escapeHtml(collection.id)}">${escapeHtml(collection.name)}</option>`)
    ];
    if (selected !== "all" && !collections.some((collection) => collection.id === selected)) {
      options.push(`<option value="${escapeHtml(selected)}">${escapeHtml(getDefaultLearningCollectionName(selected))}</option>`);
    }
    learningLanguageFilter.innerHTML = options.join("");
    learningLanguageFilter.value = selected;
  }

  if (learningSetName) {
    const selectedCollection = collections.find((collection) => collection.id === selectedLearningCollection);
    const canRename = isCustomLearningCollectionId(selectedLearningCollection);
    learningSetName.value = selectedLearningCollection && selectedLearningCollection !== "all"
      ? selectedCollection?.name ?? getDefaultLearningCollectionName(selectedLearningCollection)
      : "";
    learningSetName.disabled = !canRename;
    const renameButton = document.querySelector<HTMLButtonElement>("#learning-rename-set");
    if (renameButton) {
      renameButton.disabled = !canRename;
    }
  }

  if (learningMoveTarget) {
    learningMoveTarget.innerHTML = collections
      .map((collection) => `<option value="${escapeHtml(collection.id)}">${escapeHtml(collection.name)}</option>`)
      .join("");
    if (selectedLearningCollection && selectedLearningCollection !== "all") {
      learningMoveTarget.value = selectedLearningCollection;
    }
  }

  if (learningSort) {
    learningSort.value = selectedLearningSort;
  }
}

function filterLearningItemsByCollection(items: LearningItem[]): LearningItem[] {
  if (!selectedLearningCollection || selectedLearningCollection === "all") {
    return items;
  }

  return items.filter((item) => getLearningItemCollectionId(item) === selectedLearningCollection);
}

function getLearningItemCollectionId(item: Pick<LearningItem, "sourceLanguage" | "targetLanguage" | "collectionId">): string {
  return normalizeLearningCollectionId(item.collectionId, item.sourceLanguage);
}

function normalizeLearningCollectionId(collectionId: string | undefined, fallbackSourceLanguage: string): string {
  if (collectionId?.startsWith("custom:")) {
    return collectionId;
  }
  if (collectionId?.startsWith("source:")) {
    return collectionId;
  }
  if (collectionId?.startsWith("pair:")) {
    const [sourceLanguage = fallbackSourceLanguage] = collectionId.slice(5).split(">").map((part) => decodeURIComponent(part));
    return createDefaultLearningCollectionId(sourceLanguage);
  }
  return createDefaultLearningCollectionId(fallbackSourceLanguage);
}

function createDefaultLearningCollectionId(sourceLanguage: string): string {
  return `source:${encodeURIComponent(sourceLanguage)}`;
}

function getDefaultLearningCollectionName(collectionId: string): string {
  if (collectionId.startsWith("source:")) {
    const sourceLanguage = decodeURIComponent(collectionId.slice(7));
    return formatLanguageName(sourceLanguage, true);
  }
  if (!collectionId.startsWith("pair:")) {
    return "Custom set";
  }
  const [sourceLanguage = "", targetLanguage = ""] = collectionId.slice(5).split(">").map((part) => decodeURIComponent(part));
  return `${formatLanguageName(sourceLanguage, true)} -> ${formatLanguageName(targetLanguage)}`;
}

function isCustomLearningCollectionId(collectionId: string | undefined): boolean {
  return Boolean(collectionId?.startsWith("custom:"));
}

async function getLearningCollectionsForItems(items: LearningItem[]): Promise<LearningCollection[]> {
  const storedCollections = await getLearningCollections();
  const collectionMap = new Map<string, LearningCollection>();
  for (const collection of storedCollections.filter((collection) => isCustomLearningCollectionId(collection.id))) {
    collectionMap.set(collection.id, collection);
  }

  const now = new Date().toISOString();
  for (const item of items) {
    const id = getLearningItemCollectionId(item);
    if (!collectionMap.has(id)) {
      collectionMap.set(id, {
        id,
        name: getDefaultLearningCollectionName(id),
        createdAt: now,
        updatedAt: now
      });
    }
  }

  return [...collectionMap.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function sortLearningItems(items: LearningItem[]): LearningItem[] {
  return [...items].sort((left, right) => {
    if (selectedLearningSort === "updated-asc") {
      return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
    }
    if (selectedLearningSort === "alpha") {
      return left.normalizedText.localeCompare(right.normalizedText);
    }
    if (selectedLearningSort === "language") {
      return `${getLearningItemCollectionId(left)}:${left.normalizedText}`.localeCompare(`${getLearningItemCollectionId(right)}:${right.normalizedText}`);
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

function normalizeLearningSortMode(value: string): LearningSortMode {
  return value === "updated-asc" || value === "alpha" || value === "language"
    ? value
    : "updated-desc";
}

function getAnkiStatus(item: LearningItem): { label: string; className: string } {
  if (item.ankiNoteId && item.ankiExportHash) {
    return { label: `Synced #${item.ankiNoteId}`, className: "is-synced" };
  }
  if (item.ankiNoteId) {
    return { label: `Unsynced #${item.ankiNoteId}`, className: "is-unsynced" };
  }
  return { label: "Not in Anki", className: "is-new" };
}

function setVisibleLearningSelection(isSelected: boolean): void {
  visibleLearningItemIds.forEach((id) => {
    if (isSelected) {
      selectedLearningItemIds.add(id);
    } else {
      selectedLearningItemIds.delete(id);
    }
  });
  lastSelectedLearningIndex = undefined;
}

function syncLearningSelectionControl(): void {
  if (!learningSelectAll) {
    return;
  }

  const selectedVisibleCount = visibleLearningItemIds.filter((id) => selectedLearningItemIds.has(id)).length;
  learningSelectAll.checked = visibleLearningItemIds.length > 0 && selectedVisibleCount === visibleLearningItemIds.length;
  learningSelectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleLearningItemIds.length;
  learningSelectAll.disabled = visibleLearningItemIds.length === 0;
}

function renderVisibleLearningCheckboxes(): void {
  learningItemsList?.querySelectorAll<HTMLInputElement>("input[data-learning-select]").forEach((checkbox) => {
    const id = checkbox.dataset.learningSelect;
    checkbox.checked = Boolean(id && selectedLearningItemIds.has(id));
  });
}

function renderLearningItem(item: LearningItem, options: { index: number; selectable: boolean }): string {
  const latestOccurrence = item.occurrences[0];
  const ankiStatus = getAnkiStatus(item);
  const sourceLanguage = formatLanguageName(item.sourceLanguage, true);
  const targetLanguage = formatLanguageName(item.targetLanguage);
  const translation = item.translation?.trim() || "No translation yet";
  const meta = [
    `${item.occurrences.length} occurrence${item.occurrences.length === 1 ? "" : "s"}`,
    `updated ${formatDate(item.updatedAt)}`,
    `${sourceLanguage} -> ${targetLanguage}`
  ].join(" - ");
  return `
    <details class="ylang-learning-row ${options.selectable ? "is-selectable" : ""}" data-learning-id="${escapeHtml(item.id)}">
      <summary class="ylang-learning-summary">
        ${options.selectable ? `
          <input
            class="ylang-learning-select"
            type="checkbox"
            aria-label="Select ${escapeHtml(item.text)}"
            data-learning-select="${escapeHtml(item.id)}"
            data-learning-index="${options.index}"
            ${selectedLearningItemIds.has(item.id) ? "checked" : ""}
          />
        ` : ""}
        <div class="ylang-learning-summary-text">
          <div class="ylang-learning-title-line">
            <strong>${escapeHtml(item.text)}</strong>
            <span class="ylang-learning-kind">${escapeHtml(item.kind)}</span>
          </div>
          <div class="ylang-learning-translation">${escapeHtml(translation)}</div>
          <div class="ylang-learning-meta">${escapeHtml(meta)}</div>
        </div>
        <span class="ylang-anki-badge ${ankiStatus.className}">${escapeHtml(ankiStatus.label)}</span>
      </summary>
      <div class="ylang-learning-detail">
        <small>${escapeHtml(latestOccurrence?.sentence ?? item.sentence)}</small>
        <label>
          Original
          <input data-learning-field="text" data-learning-id="${escapeHtml(item.id)}" type="text" value="${escapeHtml(item.text)}" />
        </label>
        <label>
          Translation
          <input data-learning-field="translation" data-learning-id="${escapeHtml(item.id)}" type="text" value="${escapeHtml(item.translation ?? "")}" />
        </label>
        <label>
          Notes
          <textarea data-learning-field="notes" data-learning-id="${escapeHtml(item.id)}">${escapeHtml(item.notes ?? "")}</textarea>
        </label>
        ${item.grammar ? `<small>Grammar: ${escapeHtml(item.grammar)}</small>` : ""}
        ${item.userAttempt ? `<small>Attempt: ${escapeHtml(item.userAttempt)}</small>` : ""}
        ${item.attemptFeedback ? `<small>Feedback: ${escapeHtml(item.attemptFeedback)}</small>` : ""}
        ${renderLearningMedia(item)}
        <div class="ylang-learning-actions">
          <button type="button" data-action="clear-learning-translation" data-learning-id="${escapeHtml(item.id)}">Clear Translation</button>
          <div class="ylang-learning-actions-right">
            <button type="button" data-action="save-learning" data-learning-id="${escapeHtml(item.id)}">Save</button>
            <button class="danger" type="button" data-action="delete-learning" data-learning-id="${escapeHtml(item.id)}">Delete</button>
          </div>
        </div>
      </div>
    </details>
  `;
}

function renderLearningMedia(item: LearningItem): string {
  const media = item.media ?? [];
  if (!media.length) {
    return `<small>Media: none</small>`;
  }

  return `
    <div class="ylang-learning-media">
      ${media.map((attachment) => `
        <div class="ylang-learning-media-row">
          <small>${escapeHtml(attachment.type === "image" ? "Image" : "Audio")} - ${escapeHtml(attachment.mimeType)}</small>
          <button class="danger" type="button" data-action="delete-learning-media" data-learning-id="${escapeHtml(item.id)}" data-media-id="${escapeHtml(attachment.id)}">
            ${attachment.type === "image" ? "Delete Image" : "Delete Audio"}
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

async function saveLearningEdits(id: string): Promise<void> {
  const item = await getLearningItem(id);
  if (!item) {
    setLearningItemsStatus("Item was not found.");
    setAttemptsStatus("Item was not found.");
    await renderLearningPages();
    return;
  }

  const text = getLearningField(id, "text")?.value.trim() || item.text;
  const translation = getLearningField(id, "translation")?.value.trim();
  const notes = getLearningField(id, "notes")?.value.trim();
  const updated: LearningItem = {
    ...item,
    text,
    normalizedText: normalizeLearningText(text),
    occurrences: item.occurrences.map((occurrence, index) => index === 0
      ? { ...occurrence, selectedText: text }
      : occurrence),
    translation,
    notes,
    updatedAt: new Date().toISOString()
  };
  await browserApi.storage?.local?.set({
    [createLearningItemKey(id)]: updated
  });
  await updateLearningIndexItem(updated);
  setItemStatus(getLearningPageKind(item), "Saved item.");
  await renderLearningPages();
}

async function deleteLearningItem(id: string): Promise<void> {
  const index = await getLearningItemIndex();
  const item = await getLearningItem(id);
  const nextIndex = index.filter((item) => item.id !== id);
  await browserApi.storage?.local?.remove(createLearningItemKey(id));
  await browserApi.storage?.local?.set({ [LEARNING_INDEX_KEY]: nextIndex });
  selectedLearningItemIds.delete(id);
  setItemStatus(item ? getLearningPageKind(item) : "learned", nextIndex.length === index.length ? "Item was not found." : "Deleted item.");
  await renderLearningPages();
}

async function clearLearningTranslation(id: string): Promise<void> {
  const item = await getLearningItem(id);
  if (!item) {
    setLearningItemsStatus("Item was not found.");
    setAttemptsStatus("Item was not found.");
    await renderLearningPages();
    return;
  }

  const updated: LearningItem = {
    ...item,
    translation: undefined,
    updatedAt: new Date().toISOString()
  };
  await browserApi.storage?.local?.set({ [createLearningItemKey(id)]: updated });
  await updateLearningIndexItem(updated);
  setItemStatus(getLearningPageKind(item), "Cleared translation.");
  await renderLearningPages();
}

async function deleteLearningMedia(id: string, mediaId: string): Promise<void> {
  const item = await getLearningItem(id);
  if (!item) {
    setLearningItemsStatus("Item was not found.");
    setAttemptsStatus("Item was not found.");
    await renderLearningPages();
    return;
  }

  const updated: LearningItem = {
    ...item,
    media: (item.media ?? []).filter((attachment) => attachment.id !== mediaId),
    updatedAt: new Date().toISOString()
  };
  await browserApi.storage?.local?.set({ [createLearningItemKey(id)]: updated });
  await updateLearningIndexItem(updated);
  setItemStatus(getLearningPageKind(item), "Deleted media attachment.");
  await renderLearningPages();
}

async function clearSelectedLearningTranslations(): Promise<void> {
  const items = await getSelectedLearnedItems();
  if (!items.length) {
    setLearningItemsStatus("Select learned items first.");
    return;
  }

  const now = new Date().toISOString();
  for (const item of items) {
    const updated: LearningItem = {
      ...item,
      translation: undefined,
      updatedAt: now
    };
    await browserApi.storage?.local?.set({ [createLearningItemKey(item.id)]: updated });
    await updateLearningIndexItem(updated);
  }

  setLearningItemsStatus(`Cleared translations from ${items.length} selected item${items.length === 1 ? "" : "s"}.`);
  await renderLearningPages();
}

async function deleteSelectedLearningItems(): Promise<void> {
  const items = await getSelectedLearnedItems();
  if (!items.length) {
    setLearningItemsStatus("Select learned items first.");
    return;
  }

  const index = await getLearningItemIndex();
  const ids = new Set(items.map((item) => item.id));
  await browserApi.storage?.local?.remove(items.map((item) => createLearningItemKey(item.id)));
  await browserApi.storage?.local?.set({
    [LEARNING_INDEX_KEY]: index.filter((item) => !ids.has(item.id))
  });
  items.forEach((item) => selectedLearningItemIds.delete(item.id));
  lastSelectedLearningIndex = undefined;
  setLearningItemsStatus(`Deleted ${items.length} selected item${items.length === 1 ? "" : "s"}.`);
  await renderLearningItems();
}

async function renameSelectedLearningCollection(): Promise<void> {
  if (!selectedLearningCollection || selectedLearningCollection === "all") {
    setLearningItemsStatus("Choose a set before renaming it.");
    return;
  }
  if (!isCustomLearningCollectionId(selectedLearningCollection)) {
    setLearningItemsStatus("Built-in language collections cannot be renamed. Create a custom set instead.");
    return;
  }

  const name = learningSetName?.value.replace(/\s+/g, " ").trim();
  if (!name) {
    setLearningItemsStatus("Enter a set name first.");
    return;
  }

  await upsertLearningCollection({
    id: selectedLearningCollection,
    name
  });
  setLearningItemsStatus(`Renamed set to "${name}".`);
  await renderLearningItems();
}

async function createCustomLearningCollection(): Promise<void> {
  const name = learningNewSetName?.value.replace(/\s+/g, " ").trim();
  if (!name) {
    setLearningItemsStatus("Enter a new set name first.");
    return;
  }

  const id = `custom:${await sha256(`${name}:${Date.now()}`)}`;
  await upsertLearningCollection({ id, name });
  selectedLearningCollection = id;
  if (learningNewSetName) {
    learningNewSetName.value = "";
  }
  setLearningItemsStatus(`Created set "${name}".`);
  await renderLearningItems();
}

async function moveSelectedLearningItems(): Promise<void> {
  const targetCollectionId = learningMoveTarget?.value;
  if (!targetCollectionId) {
    setLearningItemsStatus("Choose a destination set first.");
    return;
  }

  const items = await getSelectedLearnedItems();
  if (!items.length) {
    setLearningItemsStatus("Select learned items first.");
    return;
  }

  const now = new Date().toISOString();
  for (const item of items) {
    const updated: LearningItem = {
      ...item,
      collectionId: targetCollectionId,
      updatedAt: now
    };
    await browserApi.storage?.local?.set({ [createLearningItemKey(item.id)]: updated });
    await updateLearningIndexItem(updated);
  }

  selectedLearningCollection = targetCollectionId;
  selectedLearningItemIds.clear();
  setLearningItemsStatus(`Moved ${items.length} item${items.length === 1 ? "" : "s"}.`);
  await renderLearningItems();
}

async function getSelectedLearnedItems(): Promise<LearningItem[]> {
  const items = await Promise.all([...selectedLearningItemIds].map((id) => getLearningItem(id)));
  return items.filter((item): item is LearningItem => Boolean(item && item.kind !== "attempt"));
}

async function deleteAllLearningItems(kind: LearningPageKind): Promise<void> {
  const index = await getLearningItemIndex();
  const items = await getLearningItemsForPage(kind, { limit: false });
  if (!items.length) {
    setItemStatus(kind, kind === "attempt" ? "No attempts to delete." : "No learning items to delete.");
    return;
  }

  const label = kind === "attempt" ? "attempts" : "learning items";
  if (!window.confirm(`Delete all ${items.length} ${label}? This cannot be undone.`)) {
    return;
  }

  await browserApi.storage?.local?.remove(items.map((item) => createLearningItemKey(item.id)));
  await browserApi.storage?.local?.set({
    [LEARNING_INDEX_KEY]: index.filter((item) => !items.some((candidate) => candidate.id === item.id))
  });
  setItemStatus(kind, kind === "attempt" ? "Deleted all attempts." : "Deleted all learning items.");
  await renderLearningPages();
}

async function completeEmptyLearningTranslations(provider: "microsoft-translator" | "local-llm"): Promise<void> {
  const items = (await getAllLearningItems()).filter((item) => item.kind !== "attempt" && !item.translation?.trim());
  if (!items.length) {
    setLearningItemsStatus("No empty translations to complete.");
    return;
  }

  const settings = await getSettings();
  if (provider === "local-llm" && !(settings.localLlmEnabled && settings.localLlmBaseUrl && settings.localLlmModel)) {
    setLearningItemsStatus("Local LLM is not configured.");
    return;
  }
  if (provider === "microsoft-translator" && !settings.microsoftTranslatorKey.trim()) {
    setLearningItemsStatus("Microsoft Translator key is missing.");
    return;
  }

  let completed = 0;
  for (const item of items) {
    try {
      const translatedText = await translateLearningItem(item, provider, settings);
      const updated: LearningItem = {
        ...item,
        translation: translatedText,
        updatedAt: new Date().toISOString()
      };
      await browserApi.storage?.local?.set({ [createLearningItemKey(item.id)]: updated });
      await updateLearningIndexItem(updated);
      completed += 1;
      setLearningItemsStatus(`Completed ${completed}/${items.length} translations...`);
    } catch (error) {
      setLearningItemsStatus(error instanceof Error ? error.message : String(error));
      break;
    }
  }

  setLearningItemsStatus(`Completed ${completed}/${items.length} translations.`);
  await renderLearningPages();
}

async function translateLearningItem(
  item: LearningItem,
  provider: "microsoft-translator" | "local-llm",
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<string> {
  const text = getLearningItemTranslationSource(item);
  const response = (await browserApi.runtime?.sendMessage?.({
    type: "ylang:translate.text",
    provider,
    text,
    sentence: item.sentence,
    sourceLanguage: item.sourceLanguage,
    targetLanguage: item.targetLanguage,
    microsoftTranslatorKey: settings.microsoftTranslatorKey,
    microsoftTranslatorRegion: settings.microsoftTranslatorRegion,
    localLlmEnabled: settings.localLlmEnabled,
    localLlmBaseUrl: settings.localLlmBaseUrl,
    localLlmModel: settings.localLlmModel,
    localLlmApiKey: settings.localLlmApiKey,
    localLlmDebugEnabled: settings.localLlmDebugEnabled,
    promptTemplates: settings.promptTemplates,
    localLlmMode: item.kind === "sentence" ? "subtitle-line" : "selected-phrase"
  })) as { ok?: boolean; translatedText?: string; error?: string } | undefined;

  if (!response?.ok || !response.translatedText) {
    throw new Error(response?.error ?? "Translation failed.");
  }

  return response.translatedText;
}

async function exportLearningBackup(): Promise<void> {
  const [items, index, collections] = await Promise.all([
    getAllLearningItems(),
    getLearningItemIndex(),
    getLearningCollections()
  ]);
  const exportedAt = new Date().toISOString();
  const payload = {
    kind: "ylang-learning-backup",
    version: 1,
    exportedAt,
    storage: "chrome.storage.local",
    learningIndex: index,
    learningCollections: collections,
    learningItems: items
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ylang-learning-backup-${exportedAt.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setLearningItemsStatus(`Exported backup with ${items.length} item${items.length === 1 ? "" : "s"} and ${collections.length} custom set${collections.length === 1 ? "" : "s"}.`);
}

async function importLearningBackup(file: File): Promise<void> {
  try {
    const backup = parseLearningBackup(await file.text());
    const importedItems = normalizeImportedLearningItems(backup.learningItems ?? []);
    const importedCollections = normalizeImportedLearningCollections(backup.learningCollections ?? []);
    if (!importedItems.length && !importedCollections.length) {
      setLearningItemsStatus("Backup did not contain learning items or custom sets.");
      return;
    }

    const [existingItems, existingIndex, existingCollections] = await Promise.all([
      getAllLearningItems(),
      getLearningItemIndex(),
      getLearningCollections()
    ]);
    const existingItemsById = new Map(existingItems.map((item) => [item.id, item]));
    const existingCollectionsById = new Map(existingCollections.map((collection) => [collection.id, collection]));
    const nextItemsById = new Map(existingItemsById);
    const nextCollectionsById = new Map(existingCollectionsById);
    let addedItems = 0;
    let updatedItems = 0;
    let skippedItems = 0;
    let addedCollections = 0;
    let updatedCollections = 0;

    for (const collection of importedCollections) {
      const existing = existingCollectionsById.get(collection.id);
      if (!existing) {
        nextCollectionsById.set(collection.id, collection);
        addedCollections += 1;
        continue;
      }
      if (compareIsoDates(collection.updatedAt, existing.updatedAt) > 0) {
        nextCollectionsById.set(collection.id, collection);
        updatedCollections += 1;
      }
    }

    for (const item of importedItems) {
      const existing = existingItemsById.get(item.id);
      if (!existing) {
        nextItemsById.set(item.id, item);
        addedItems += 1;
        continue;
      }
      if (compareIsoDates(item.updatedAt, existing.updatedAt) > 0) {
        nextItemsById.set(item.id, item);
        updatedItems += 1;
      } else {
        skippedItems += 1;
      }
    }

    const nextItems = [...nextItemsById.values()].sort((left, right) => compareIsoDates(right.updatedAt, left.updatedAt));
    const nextIndex = nextItems.map(createLearningIndexItem);
    const setPayload: Record<string, unknown> = {
      [LEARNING_INDEX_KEY]: nextIndex,
      [LEARNING_COLLECTIONS_KEY]: [...nextCollectionsById.values()].sort((left, right) => left.name.localeCompare(right.name))
    };
    for (const item of nextItems) {
      setPayload[createLearningItemKey(item.id)] = item;
    }
    const staleImportedItemKeys = existingIndex
      .filter((indexItem) => !nextItemsById.has(indexItem.id))
      .map((indexItem) => createLearningItemKey(indexItem.id));
    if (staleImportedItemKeys.length) {
      await browserApi.storage?.local?.remove(staleImportedItemKeys);
    }
    await browserApi.storage?.local?.set(setPayload);
    selectedLearningItemIds.clear();
    lastSelectedLearningIndex = undefined;
    setLearningItemsStatus(
      `Imported backup: ${addedItems} new, ${updatedItems} updated, ${skippedItems} unchanged; ` +
      `${addedCollections} new sets, ${updatedCollections} updated sets.`
    );
    await renderLearningPages();
  } catch (error) {
    setLearningItemsStatus(error instanceof Error ? error.message : String(error));
  }
}

function parseLearningBackup(jsonText: string): LearningBackup {
  const parsed = JSON.parse(jsonText) as Partial<LearningBackup>;
  if (parsed.kind !== "ylang-learning-backup" || parsed.version !== 1) {
    throw new Error("That file does not look like a ylang learning backup.");
  }
  return parsed as LearningBackup;
}

function normalizeImportedLearningItems(items: LearningItem[]): LearningItem[] {
  return items
    .filter(isLearningItemLike)
    .map((item) => ({
      ...item,
      collectionId: normalizeLearningCollectionId(item.collectionId, item.sourceLanguage),
      media: Array.isArray(item.media) ? item.media : [],
      occurrences: Array.isArray(item.occurrences) ? item.occurrences : []
    }));
}

function normalizeImportedLearningCollections(collections: LearningCollection[]): LearningCollection[] {
  return collections
    .filter(isLearningCollectionLike)
    .filter((collection) => isCustomLearningCollectionId(collection.id));
}

function isLearningItemLike(value: unknown): value is LearningItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<LearningItem>;
  return typeof item.id === "string" &&
    typeof item.kind === "string" &&
    ["word", "phrase", "sentence", "grammar", "attempt"].includes(item.kind) &&
    typeof item.sourceLanguage === "string" &&
    typeof item.targetLanguage === "string" &&
    typeof item.text === "string" &&
    typeof item.normalizedText === "string" &&
    typeof item.sentence === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string";
}

function isLearningCollectionLike(value: unknown): value is LearningCollection {
  if (!value || typeof value !== "object") {
    return false;
  }
  const collection = value as Partial<LearningCollection>;
  return typeof collection.id === "string" &&
    typeof collection.name === "string" &&
    typeof collection.createdAt === "string" &&
    typeof collection.updatedAt === "string";
}

function compareIsoDates(left: string | undefined, right: string | undefined): number {
  return Date.parse(left ?? "") - Date.parse(right ?? "");
}

async function exportLearningItemsToAnki(): Promise<void> {
  if (ankiSyncInProgress) {
    setLearningItemsStatus("Anki sync is already running.");
    return;
  }

  const items = (await getAllLearningItems()).filter((item) => item.kind !== "attempt");
  if (!items.length) {
    setLearningItemsStatus("No learning items to export.");
    return;
  }

  ankiSyncInProgress = true;
  setAnkiExportButtonBusy(true);
  try {
    const settings = await getSettings();
    const deckPrefix = normalizeAnkiDeckPrefix(settings.ankiDeckPrefix);
    const deckSuffixes = settings.ankiDeckLanguageSuffixes;
    const preparedDecks = new Set<string>();
    setLearningItemsStatus("Checking AnkiConnect...");
    await ensureAnkiModel();
    setLearningItemsStatus(`Anki is ready. Preparing ${items.length} learning items...`);
    let exported = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of items) {
      const deckName = createAnkiDeckName(deckPrefix, item.targetLanguage, deckSuffixes);
      if (!preparedDecks.has(deckName)) {
        setLearningItemsStatus(`Preparing Anki deck "${deckName}"...`);
        await ensureAnkiDeck(deckName);
        preparedDecks.add(deckName);
      }
      const exportHash = await createAnkiExportHash(item, deckName);
      if (item.ankiNoteId && item.ankiExportHash === exportHash) {
        setLearningItemsStatus(`Checking unchanged Anki note ${exported + updated + skipped + 1}/${items.length} in "${deckName}": ${item.text}`);
        const storedNoteExists = await ankiNoteExists(item.ankiNoteId);
        if (storedNoteExists) {
          skipped += 1;
          setLearningItemsStatus(`Skipped unchanged ${skipped} / synced ${exported + updated} / total ${items.length}...`);
          continue;
        }
        setLearningItemsStatus(`Stored Anki note was missing; recreating ${exported + updated + skipped + 1}/${items.length}: ${item.text}`);
      }

      setLearningItemsStatus(`Syncing ${exported + updated + skipped + 1}/${items.length} to "${deckName}": ${item.text}`);
      const result = await upsertAnkiNote(item, deckName);
      if (result) {
        await markLearningItemExported(item, result.noteId, exportHash);
        exported += result.action === "created" ? 1 : 0;
        updated += result.action === "updated" ? 1 : 0;
      }
      setLearningItemsStatus(`Synced ${exported + updated}/${items.length} Anki notes; skipped ${skipped} unchanged...`);
    }
    setLearningItemsStatus(`Anki sync complete: ${exported} new, ${updated} updated, ${skipped} unchanged across ${preparedDecks.size} deck${preparedDecks.size === 1 ? "" : "s"}.`);
    await renderLearningPages();
  } catch (error) {
    setLearningItemsStatus(
      `Anki sync stopped. Start Anki with AnkiConnect installed, then try again. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    ankiSyncInProgress = false;
    setAnkiExportButtonBusy(false);
  }
}

function setAnkiExportButtonBusy(isBusy: boolean): void {
  const button = document.querySelector<HTMLButtonElement>("#learning-export-anki");
  if (!button) {
    return;
  }

  button.disabled = isBusy;
  button.textContent = isBusy ? "Syncing To Anki..." : "Export All To Anki";
}

function normalizeAnkiDeckPrefix(deckPrefix: string | undefined): string {
  const normalized = deckPrefix?.replace(/\s+/g, " ").trim();
  return normalized || DEFAULT_ANKI_DECK_PREFIX;
}

function createAnkiDeckName(deckPrefix: string, targetLanguage: string, suffixes: Record<string, string> = {}): string {
  const suffix = suffixes[targetLanguage]?.trim() || getDefaultAnkiDeckSuffix(targetLanguage);
  return `${deckPrefix} - ${suffix}`;
}

function getDefaultAnkiDeckSuffix(targetLanguage: string): string {
  return findLanguageOption(targetLanguage)?.name ?? targetLanguage;
}

function updateAnkiDeckExample(suffixes?: Record<string, string>): void {
  if (!ankiDeckExample) {
    return;
  }

  const prefix = normalizeAnkiDeckPrefix(getField("ankiDeckPrefix").value);
  const targetLanguage = getField("targetLanguage").value;
  const deckName = createAnkiDeckName(prefix, targetLanguage, suffixes);
  ankiDeckExample.textContent = `Anki decks will be named like "${deckName}". Later, each language can get its own custom suffix.`;
}

async function ensureAnkiDeck(deckName: string): Promise<void> {
  await invokeAnki("createDeck", { deck: deckName });
}

async function ensureAnkiModel(): Promise<void> {
  const models = (await invokeAnki("modelNames", {})) as string[];
  if (models.includes(ANKI_MODEL_NAME)) {
    await updateAnkiModelStyleAndTemplates();
    return;
  }

  await invokeAnki("createModel", {
    modelName: ANKI_MODEL_NAME,
    inOrderFields: [
      "YlangId",
      "Original",
      "Sentence",
      "Translation",
      "Grammar",
      "Notes",
      "Attempt",
      "Feedback",
      "SourceTitle",
      "SourceUrl",
      "Timestamp",
      "Image",
      "Audio"
    ],
    css: createAnkiCardCss(),
    cardTemplates: createAnkiCardTemplates()
  });
}

async function updateAnkiModelStyleAndTemplates(): Promise<void> {
  await invokeAnki("updateModelStyling", {
    model: {
      name: ANKI_MODEL_NAME,
      css: createAnkiCardCss()
    }
  });
  await invokeAnki("updateModelTemplates", {
    model: {
      name: ANKI_MODEL_NAME,
      templates: Object.fromEntries(createAnkiCardTemplates().map((template) => [
        template.Name,
        {
          Front: template.Front,
          Back: template.Back
        }
      ]))
    }
  });
}

function createAnkiCardCss(): string {
  return [
    ".card {",
    "  --ylang-bg: #fffdf7;",
    "  --ylang-panel: #fff6dd;",
    "  --ylang-text: #172018;",
    "  --ylang-muted: #526056;",
    "  --ylang-accent: #8a6a1f;",
    "  --ylang-accent-strong: #174f3a;",
    "  --ylang-border: #dfc36d;",
    "  font-family: Inter, Segoe UI, Arial, sans-serif;",
    "  font-size: 20px;",
    "  line-height: 1.38;",
    "  text-align: left;",
    "  color: var(--ylang-text);",
    "  background: var(--ylang-bg);",
    "  padding: 18px;",
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  .card {",
    "    --ylang-bg: #07130d;",
    "    --ylang-panel: #12251a;",
    "    --ylang-text: #fffbe9;",
    "    --ylang-muted: #c9d6c8;",
    "    --ylang-accent: #f4c461;",
    "    --ylang-accent-strong: #ffd84a;",
    "    --ylang-border: #6f8b34;",
    "  }",
    "}",
    ".original { font-size: 1.12em; font-weight: 800; color: var(--ylang-text); }",
    ".sentence { margin-top: 14px; color: var(--ylang-text); }",
    ".translation { margin-top: 16px; color: var(--ylang-accent-strong); font-weight: 800; }",
    ".section { margin-top: 14px; padding: 12px; border: 1px solid var(--ylang-border); border-radius: 10px; background: var(--ylang-panel); color: var(--ylang-text); }",
    ".label { display: block; margin-bottom: 5px; color: var(--ylang-accent); font-size: 0.74em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }",
    ".meta { margin-top: 16px; color: var(--ylang-muted); font-size: 13px; line-height: 1.35; }",
    "hr { border: 0; border-top: 1px solid var(--ylang-border); margin: 18px 0; }",
    "img { display: block; max-width: 100%; height: auto; margin-top: 14px; border-radius: 8px; }"
  ].join("\n");
}

function createAnkiCardTemplates(): Array<{ Name: string; Front: string; Back: string }> {
  return [
    {
      Name: "Card 1",
      Front: [
        "<div class=\"original\">{{Original}}</div>",
        "<div class=\"sentence\">{{Sentence}}</div>",
        "{{Image}}"
      ].join("\n"),
      Back: [
        "{{FrontSide}}",
        "<hr>",
        "<div class=\"translation\">{{Translation}}</div>",
        "{{Audio}}",
        "{{#Grammar}}<div class=\"section\"><span class=\"label\">Grammar</span>{{Grammar}}</div>{{/Grammar}}",
        "{{#Notes}}<div class=\"section\"><span class=\"label\">Notes</span>{{Notes}}</div>{{/Notes}}",
        "{{#Attempt}}<div class=\"section\"><span class=\"label\">Attempt</span>{{Attempt}}</div>{{/Attempt}}",
        "{{#Feedback}}<div class=\"section\"><span class=\"label\">Feedback</span>{{Feedback}}</div>{{/Feedback}}",
        "<div class=\"meta\">{{SourceTitle}}<br>{{SourceUrl}}<br>{{Timestamp}}</div>"
      ].join("\n")
    }
  ];
}

async function upsertAnkiNote(item: LearningItem, deckName: string): Promise<AnkiUpsertResult | undefined> {
  const fields = await createAnkiFields(item);
  const existingNoteId = await getExistingAnkiNoteId(item);
  if (existingNoteId) {
    await invokeAnki("updateNoteFields", {
      note: {
        id: existingNoteId,
        fields
      }
    });
    await invokeAnki("changeDeck", {
      notes: [existingNoteId],
      deck: deckName
    });
    await invokeAnki("addTags", {
      notes: [existingNoteId],
      tags: createAnkiTags(item).join(" ")
    });
    return { noteId: existingNoteId, action: "updated" };
  }

  const noteId = (await invokeAnki("addNote", {
    note: {
      deckName,
      modelName: ANKI_MODEL_NAME,
      fields,
      options: {
        allowDuplicate: false,
        duplicateScope: "deck",
        duplicateScopeOptions: {
          deckName,
          checkChildren: false,
          checkAllModels: false
        }
      },
      tags: createAnkiTags(item)
    }
  })) as number | null;
  return noteId ? { noteId, action: "created" } : undefined;
}

async function findAnkiNoteId(ylangId: string): Promise<number | undefined> {
  const result = (await invokeAnki("findNotes", {
    query: `YlangId:${escapeAnkiQuery(ylangId)}`
  })) as number[];
  return result[0];
}

async function getExistingAnkiNoteId(item: LearningItem): Promise<number | undefined> {
  if (item.ankiNoteId && await ankiNoteExists(item.ankiNoteId)) {
    return item.ankiNoteId;
  }

  return findAnkiNoteId(item.id);
}

async function ankiNoteExists(noteId: number): Promise<boolean> {
  const notes = (await invokeAnki("notesInfo", {
    notes: [noteId]
  })) as unknown[];
  const note = notes[0];
  return Boolean(note && typeof note === "object" && "noteId" in note);
}

async function createAnkiFields(item: LearningItem): Promise<Record<string, string>> {
  const mediaFields = await uploadAnkiMedia(item);
  const latestOccurrence = item.occurrences[0];
  return {
    YlangId: item.id,
    Original: escapeHtml(item.text),
    Sentence: escapeHtml(item.sentence),
    Translation: escapeHtml(item.translation ?? ""),
    Grammar: formatAnkiMultiline(item.grammar),
    Notes: formatAnkiMultiline(item.notes),
    Attempt: escapeHtml(item.userAttempt ?? ""),
    Feedback: formatAnkiMultiline(item.attemptFeedback),
    SourceTitle: escapeHtml(latestOccurrence?.source.title ?? ""),
    SourceUrl: escapeHtml(latestOccurrence?.source.url ?? ""),
    Timestamp: formatTimestamp(latestOccurrence?.startMs),
    Image: mediaFields.image,
    Audio: mediaFields.audio
  };
}

async function uploadAnkiMedia(item: LearningItem): Promise<{ image: string; audio: string }> {
  const image = (item.media ?? []).find((attachment) => attachment.type === "image");
  const audio = (item.media ?? []).find((attachment) => attachment.type === "audio");
  return {
    image: image ? `<img src="${escapeHtml(await storeAnkiMedia(image.filename, image.dataUrl))}">` : "",
    audio: audio ? `[sound:${escapeHtml(await storeAnkiMedia(audio.filename, audio.dataUrl))}]` : ""
  };
}

async function storeAnkiMedia(filename: string, dataUrl: string): Promise<string> {
  const data = dataUrl.split(",")[1] ?? "";
  await invokeAnki("storeMediaFile", {
    filename,
    data
  });
  return filename;
}

async function markLearningItemExported(item: LearningItem, noteId: number, exportHash: string): Promise<void> {
  const updated: LearningItem = {
    ...item,
    ankiNoteId: noteId,
    ankiUpdatedAt: new Date().toISOString(),
    ankiExportHash: exportHash,
    updatedAt: new Date().toISOString()
  };
  await browserApi.storage?.local?.set({ [createLearningItemKey(item.id)]: updated });
  await updateLearningIndexItem(updated);
}

async function createAnkiExportHash(item: LearningItem, deckName: string): Promise<string> {
  const latestOccurrence = item.occurrences[0];
  const payload = {
    model: ANKI_MODEL_NAME,
    deck: deckName,
    id: item.id,
    kind: item.kind,
    sourceLanguage: item.sourceLanguage,
    targetLanguage: item.targetLanguage,
    text: item.text,
    sentence: item.sentence,
    translation: item.translation ?? "",
    grammar: item.grammar ?? "",
    notes: item.notes ?? "",
    userAttempt: item.userAttempt ?? "",
    attemptFeedback: item.attemptFeedback ?? "",
    sourceTitle: latestOccurrence?.source.title ?? "",
    sourceUrl: latestOccurrence?.source.url ?? "",
    timestamp: formatTimestamp(latestOccurrence?.startMs),
    media: (item.media ?? []).map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      filename: attachment.filename,
      dataUrl: attachment.dataUrl,
      startMs: attachment.startMs,
      endMs: attachment.endMs
    }))
  };
  return sha256(JSON.stringify(payload));
}

function createAnkiTags(item: LearningItem): string[] {
  return ["ylang", `ylang-${item.kind}`, `src-${sanitizeAnkiTag(item.sourceLanguage)}`, `to-${sanitizeAnkiTag(item.targetLanguage)}`];
}

function sanitizeAnkiTag(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "_");
}

function escapeAnkiQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatAnkiMultiline(value: string | undefined): string {
  return escapeHtml(value ?? "").replace(/\n/g, "<br>");
}

function formatTimestamp(startMs: number | undefined): string {
  if (startMs === undefined) {
    return "";
  }

  const totalSeconds = Math.floor(startMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function invokeAnki(action: string, params: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("http://127.0.0.1:8765", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params })
  });
  const body = (await response.json()) as { result?: unknown; error?: string | null };
  if (body.error) {
    throw new Error(body.error);
  }

  return body.result;
}

async function getAllLearningItems(): Promise<LearningItem[]> {
  const index = await getLearningItemIndex();
  const items = await Promise.all(index.map((item) => getLearningItem(item.id)));
  return items.filter((item): item is LearningItem => Boolean(item));
}

async function getLearningItemsForPage(kind: LearningPageKind, options: { limit?: boolean } = {}): Promise<LearningItem[]> {
  const index = await getLearningItemIndex();
  const filteredIndex = index
    .filter((item) => kind === "attempt" ? item.kind === "attempt" : item.kind !== "attempt");
  const visibleIndex = options.limit === false ? filteredIndex : filteredIndex.slice(0, 80);
  const items = await Promise.all(visibleIndex.map((item) => getLearningItem(item.id)));
  return items.filter((item): item is LearningItem => Boolean(item));
}

async function renderLearningPages(): Promise<void> {
  await renderLearningItems();
  await renderAttemptItems();
}

function getLearningPageKind(item: LearningItem): LearningPageKind {
  return item.kind === "attempt" ? "attempt" : "learned";
}

function getLearningItemTranslationSource(item: LearningItem): string {
  if (item.kind === "sentence") {
    return item.sentence;
  }

  const text = item.text.startsWith("Grammar: ") ? item.text.replace(/^Grammar:\s*/u, "") : item.text;
  return text
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getSavedTranscriptIndex(): Promise<SavedTranscriptIndexItem[]> {
  const stored = await browserApi.storage?.local?.get(SAVED_TRANSCRIPT_INDEX_KEY);
  return (stored?.[SAVED_TRANSCRIPT_INDEX_KEY] as SavedTranscriptIndexItem[] | undefined) ?? [];
}

async function getLearningItemIndex(): Promise<LearningItemIndexItem[]> {
  const stored = await browserApi.storage?.local?.get(LEARNING_INDEX_KEY);
  return (stored?.[LEARNING_INDEX_KEY] as LearningItemIndexItem[] | undefined) ?? [];
}

async function getLearningCollections(): Promise<LearningCollection[]> {
  const stored = await browserApi.storage?.local?.get(LEARNING_COLLECTIONS_KEY);
  return (stored?.[LEARNING_COLLECTIONS_KEY] as LearningCollection[] | undefined) ?? [];
}

async function upsertLearningCollection(input: { id: string; name: string }): Promise<void> {
  const collections = await getLearningCollections();
  const existing = collections.find((collection) => collection.id === input.id);
  const now = new Date().toISOString();
  const collection: LearningCollection = {
    id: input.id,
    name: input.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await browserApi.storage?.local?.set({
    [LEARNING_COLLECTIONS_KEY]: [
      collection,
      ...collections.filter((candidate) => candidate.id !== input.id)
    ]
  });
}

async function getLearningItem(id: string): Promise<LearningItem | undefined> {
  const stored = await browserApi.storage?.local?.get(createLearningItemKey(id));
  return stored?.[createLearningItemKey(id)] as LearningItem | undefined;
}

async function updateLearningIndexItem(item: LearningItem): Promise<void> {
  const index = await getLearningItemIndex();
  const nextIndex = [
    {
      id: item.id,
      kind: item.kind,
      text: item.text,
      normalizedText: item.normalizedText,
      sentence: item.sentence,
      sourceLanguage: item.sourceLanguage,
      targetLanguage: item.targetLanguage,
      collectionId: item.collectionId,
      occurrenceCount: item.occurrences.length,
      updatedAt: item.updatedAt
    },
    ...index.filter((candidate) => candidate.id !== item.id)
  ];
  await browserApi.storage?.local?.set({ [LEARNING_INDEX_KEY]: nextIndex });
}

function createLearningIndexItem(item: LearningItem): LearningItemIndexItem {
  return {
    id: item.id,
    kind: item.kind,
    text: item.text,
    normalizedText: item.normalizedText,
    sentence: item.sentence,
    sourceLanguage: item.sourceLanguage,
    targetLanguage: item.targetLanguage,
    collectionId: item.collectionId,
    occurrenceCount: item.occurrences.length,
    updatedAt: item.updatedAt
  };
}

async function getSavedTranscript(id: string): Promise<SavedTranscriptRecord | undefined> {
  const stored = await browserApi.storage?.local?.get(createSavedTranscriptKey(id));
  return stored?.[createSavedTranscriptKey(id)] as SavedTranscriptRecord | undefined;
}

function createSavedTranscriptKey(id: string): string {
  return `ylang:saved-transcript:${id}`;
}

function createLearningItemKey(id: string): string {
  return `ylang:learning-item:${id}`;
}

function getLearningField(id: string, field: "text" | "translation" | "notes"): HTMLInputElement | HTMLTextAreaElement | null {
  return document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-learning-id="${cssEscape(id)}"][data-learning-field="${field}"]`
  ) ?? null;
}

function normalizeLearningText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function formatTranscript(record: SavedTranscriptRecord): string {
  return record.cues
    .map((cue, index) => `${String(index + 1).padStart(4, "0")}\t${cue.normalizedText}`)
    .join("\n");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setSavedTranscriptsStatus(message: string): void {
  if (savedTranscriptsStatus) {
    savedTranscriptsStatus.textContent = message;
  }
}

function setLearningItemsStatus(message: string): void {
  if (learningItemsStatus) {
    learningItemsStatus.textContent = message;
  }
}

function setAttemptsStatus(message: string): void {
  if (attemptsStatus) {
    attemptsStatus.textContent = message;
  }
}

function setItemStatus(kind: LearningPageKind, message: string): void {
  if (kind === "attempt") {
    setAttemptsStatus(message);
  } else {
    setLearningItemsStatus(message);
  }
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"');
}

function getCheckbox(name: string): HTMLInputElement {
  const field = getField(name);
  if (!(field instanceof HTMLInputElement)) {
    throw new Error(`Expected checkbox field: ${name}`);
  }

  return field;
}

function getField(name: string): HTMLInputElement | HTMLSelectElement {
  const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) {
    throw new Error(`Missing settings field: ${name}`);
  }

  return field;
}
