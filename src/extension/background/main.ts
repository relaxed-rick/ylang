import { mergePromptTemplates } from "../../core/promptTemplates";
import type { PromptTemplateKey, PromptTemplateMap } from "../../core/types";

type DeepLRequest = {
  type: "ylang:deepl.translate";
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  pinToTop: boolean;
  focusOnUpdate: boolean;
  windowPreset?: string;
  windowXPercent?: number;
  windowYPercent?: number;
  screenId?: string;
};

type DeepLDisplaysRequest = {
  type: "ylang:deepl.displays";
};

type FetchTextRequest = {
  type: "ylang:fetchText";
  url: string;
};

type TranslateTextRequest = {
  type: "ylang:translate.text";
  provider: "microsoft-translator" | "local-llm";
  text: string;
  sentence?: string;
  sourceLanguage: string;
  targetLanguage: string;
  microsoftTranslatorKey: string;
  microsoftTranslatorRegion: string;
  localLlmEnabled?: boolean;
  localLlmBaseUrl?: string;
  localLlmModel?: string;
  localLlmApiKey?: string;
  localLlmDebugEnabled?: boolean;
  localLlmMode?: "subtitle-line" | "selected-phrase";
  promptTemplates?: PromptTemplateMap;
};

type ExplainGrammarRequest = {
  type: "ylang:llm.explainGrammar";
  sentence: string;
  selectedText?: string;
  translation?: string;
  sourceLanguage: string;
  targetLanguage: string;
  localLlmEnabled: boolean;
  localLlmBaseUrl: string;
  localLlmModel: string;
  localLlmApiKey: string;
  localLlmDebugEnabled?: boolean;
  promptTemplates?: PromptTemplateMap;
};

type EvaluateAttemptRequest = {
  type: "ylang:llm.evaluateAttempt";
  sentence: string;
  attempt: string;
  translation?: string;
  sourceLanguage: string;
  targetLanguage: string;
  localLlmEnabled: boolean;
  localLlmBaseUrl: string;
  localLlmModel: string;
  localLlmApiKey: string;
  localLlmDebugEnabled?: boolean;
  promptTemplates?: PromptTemplateMap;
};

type LocalLlmStreamEnvelope = {
  type: "ylang:llm.stream";
  request: TranslateTextRequest | ExplainGrammarRequest | EvaluateAttemptRequest;
};

type MicrosoftTranslateResponse = Array<{
  translations?: Array<{
    text?: string;
  }>;
}>;

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      thinking?: string;
      reasoning_content?: string;
    };
  }>;
};

type LocalLlmChatRequest = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  debugEnabled?: boolean;
};

type LocalLlmRequestBody = Record<string, unknown>;

type DeepLState = {
  windowId?: number;
  tabId?: number;
};

type DeepLTab = {
  id?: number;
  windowId?: number;
  url?: string;
  managed?: boolean;
};

type DisplayInfo = {
  id: string;
  name?: string;
  isPrimary?: boolean;
  bounds: { left: number; top: number; width: number; height: number };
  workArea?: { left: number; top: number; width: number; height: number };
};

declare const chrome: {
  runtime: {
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ): void;
    };
    onConnect: {
      addListener(callback: (port: RuntimePort) => void): void;
    };
  };
  windows: {
    create(createData: {
      url: string;
      type: "popup";
      width: number;
      height: number;
      left?: number;
      top?: number;
      focused?: boolean;
    }): Promise<{ id?: number; tabs?: Array<{ id?: number }> }>;
    update(
      windowId: number,
      updateInfo: { width?: number; height?: number; left?: number; top?: number; focused?: boolean }
    ): Promise<unknown>;
    get(windowId: number): Promise<{ id?: number; type?: string }>;
  };
  tabs: {
    get(tabId: number): Promise<DeepLTab>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    update(tabId: number, updateProperties: { active?: boolean; url?: string }): Promise<unknown>;
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    };
  };
  system?: {
    display?: {
      getInfo(): Promise<DisplayInfo[]>;
    };
  };
};

type RuntimePort = {
  name: string;
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(callback: () => void): void;
  };
  postMessage(message: unknown): void;
};

const DEEPL_STATE_KEY = "ylang:deepl-window";
const LLM_DEBUG_LAST_KEY = "ylang:llm-debug:last";
const DEEPL_POPUP_WIDTH = 460;
const DEEPL_POPUP_HEIGHT = 678;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isFetchTextRequest(message)) {
    void fetchText(message.url)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (isDeepLDisplaysRequest(message)) {
    void getDeepLDisplays()
      .then((displays) => sendResponse({ ok: true, displays }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (!isDeepLRequest(message)) {
    if (isTranslateTextRequest(message)) {
      void translateText(message)
        .then((translatedText) => sendResponse({ ok: true, translatedText }))
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    if (isExplainGrammarRequest(message)) {
      void explainGrammar(message)
        .then((explanation) => sendResponse({ ok: true, explanation }))
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    if (isEvaluateAttemptRequest(message)) {
      void evaluateAttempt(message)
        .then((feedback) => sendResponse({ ok: true, feedback }))
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    return false;
  }

  void openOrUpdateDeepL(message)
    .then((translatedText) => sendResponse({ ok: true, translatedText }))
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ylang:llm-stream") {
    return;
  }

  let disconnected = false;
  port.onDisconnect.addListener(() => {
    disconnected = true;
  });
  port.onMessage.addListener((message) => {
    if (!isLocalLlmStreamEnvelope(message)) {
      postPortMessage(port, disconnected, { type: "error", error: "Unsupported stream request." });
      return;
    }

    void streamLocalLlmChat(port, () => disconnected, createLocalLlmChatRequest(message.request))
      .catch((error: unknown) => {
        postPortMessage(port, disconnected, {
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      });
  });
});

async function openOrUpdateDeepL(request: DeepLRequest): Promise<string | undefined> {
  const reusableTab = await findReusableDeepLTab();

  if (!reusableTab?.id) {
    const bounds = await resolveDeepLWindowBounds(request);
    const created = await chrome.windows.create({
      url: createDeepLBaseUrl(request.sourceLanguage, request.targetLanguage),
      type: "popup",
      width: DEEPL_POPUP_WIDTH,
      height: DEEPL_POPUP_HEIGHT,
      left: bounds.left,
      top: bounds.top,
      focused: request.focusOnUpdate
    });

    await saveDeepLState({
      windowId: created.id,
      tabId: created.tabs?.[0]?.id
    });
    await delay(1800);
  } else {
    await saveDeepLState({
      windowId: reusableTab.windowId,
      tabId: reusableTab.id
    });

    if (reusableTab.windowId) {
      await updateDeepLWindowBounds(reusableTab.windowId, request, reusableTab.managed);
    }
  }

  const latest = await getDeepLState();
  if (!latest.tabId) {
    throw new Error("DeepL tab was not created.");
  }

  const translatedText = await sendDeepLText(latest.tabId, request);
  if (translatedText !== false) {
    return translatedText;
  }

  await chrome.tabs.update(latest.tabId, {
    active: true,
    url: createDeepLUrl(request.text, request.sourceLanguage, request.targetLanguage)
  });
  if (latest.windowId) {
    await updateDeepLWindowBounds(latest.windowId, request, true);
  }
  await delay(1800);
  const fallbackTranslatedText = await sendDeepLText(latest.tabId, request);
  return fallbackTranslatedText === false ? undefined : fallbackTranslatedText;
}

async function explainGrammar(request: ExplainGrammarRequest): Promise<string> {
  return sendLocalLlmChat(createGrammarChatRequest(request));
}

async function evaluateAttempt(request: EvaluateAttemptRequest): Promise<string> {
  return sendLocalLlmChat(createAttemptEvaluationChatRequest(request));
}

async function translateText(request: TranslateTextRequest): Promise<string> {
  if (request.provider === "microsoft-translator") {
    return translateWithMicrosoft(request);
  }

  if (request.provider === "local-llm") {
    return translateWithLocalLlm(request);
  }

  throw new Error("Unsupported translation provider.");
}

async function translateWithLocalLlm(request: TranslateTextRequest): Promise<string> {
  return sendLocalLlmChat(createTranslationChatRequest(request));
}

function createLocalLlmChatRequest(
  request: TranslateTextRequest | ExplainGrammarRequest | EvaluateAttemptRequest
): LocalLlmChatRequest {
  if (request.type === "ylang:translate.text") {
    if (request.provider !== "local-llm") {
      throw new Error("Streaming only supports local LLM requests.");
    }
    return createTranslationChatRequest(request);
  }
  if (request.type === "ylang:llm.explainGrammar") {
    return createGrammarChatRequest(request);
  }
  return createAttemptEvaluationChatRequest(request);
}

function createGrammarChatRequest(request: ExplainGrammarRequest): LocalLlmChatRequest {
  return {
    enabled: request.localLlmEnabled,
    baseUrl: request.localLlmBaseUrl,
    model: request.localLlmModel,
    apiKey: request.localLlmApiKey,
    systemPrompt: createPrompt("grammarSystem", request.promptTemplates, createCommonPromptVariables(request)),
    userPrompt: createGrammarUserPrompt(request),
    maxTokens: 360,
    debugEnabled: request.localLlmDebugEnabled
  };
}

function createAttemptEvaluationChatRequest(request: EvaluateAttemptRequest): LocalLlmChatRequest {
  return {
    enabled: request.localLlmEnabled,
    baseUrl: request.localLlmBaseUrl,
    model: request.localLlmModel,
    apiKey: request.localLlmApiKey,
    systemPrompt: createPrompt("attemptEvaluationSystem", request.promptTemplates, createCommonPromptVariables(request)),
    userPrompt: createAttemptEvaluationUserPrompt(request),
    maxTokens: 140,
    debugEnabled: request.localLlmDebugEnabled
  };
}

function createTranslationChatRequest(request: TranslateTextRequest): LocalLlmChatRequest {
  const mode = request.localLlmMode ?? "subtitle-line";
  return {
    enabled: Boolean(request.localLlmEnabled),
    baseUrl: request.localLlmBaseUrl ?? "",
    model: request.localLlmModel ?? "",
    apiKey: request.localLlmApiKey ?? "",
    systemPrompt: createPrompt(
      mode === "selected-phrase" ? "selectedTranslationSystem" : "lineTranslationSystem",
      request.promptTemplates,
      createCommonPromptVariables(request)
    ),
    userPrompt:
      mode === "selected-phrase"
        ? createSelectedTranslationUserPrompt(request)
        : createLineTranslationUserPrompt(request),
    maxTokens: mode === "selected-phrase" ? 90 : 70,
    debugEnabled: request.localLlmDebugEnabled
  };
}

async function sendLocalLlmChat(request: LocalLlmChatRequest): Promise<string> {
  const response = await requestLocalLlmCompletion(request, false);
  return response.content;
}

async function requestLocalLlmCompletion(
  request: LocalLlmChatRequest,
  stream: boolean
): Promise<{
  response: Response;
  requestBody: LocalLlmRequestBody;
  startedAt: number;
  baseUrl: string;
  content: string;
  thinking: string;
  rawContent: string;
}> {
  if (!request.enabled) {
    throw new Error("Local LLM is disabled.");
  }

  const baseUrl = normalizeLocalLlmBaseUrl(request.baseUrl);
  if (!baseUrl || !request.model.trim()) {
    throw new Error("Configure local LLM base URL and model in settings.");
  }

  const requestBody = createLocalLlmRequestBody(request, stream);
  const startedAt = Date.now();
  let usedRequestBody = requestBody;
  let response = await postLocalLlmChat(baseUrl, request.apiKey, usedRequestBody);
  if (!response.ok && (response.status === 400 || response.status === 422)) {
    const error = await safeReadResponseText(response);
    const fallbackBody = { ...requestBody };
    delete fallbackBody.reasoning_effort;
    delete fallbackBody.reasoning;
    usedRequestBody = {
      ...fallbackBody,
      ylangDebugRetryReason: `Server rejected reasoning controls: ${response.status} ${error}`.trim()
    };
    response = await postLocalLlmChat(baseUrl, request.apiKey, fallbackBody);
  }

  if (stream) {
    return { response, requestBody: usedRequestBody, startedAt, baseUrl, content: "", thinking: "", rawContent: "" };
  }

  if (!response.ok) {
    await storeLocalLlmDebug(request, usedRequestBody, {
      status: response.status,
      error: await safeReadResponseText(response),
      durationMs: Date.now() - startedAt
    });
    throw new Error(`Local LLM failed: ${response.status}`);
  }

  const result = (await response.json()) as OpenAiChatResponse;
  const message = result.choices?.[0]?.message;
  const rawContent = message?.content?.trim() ?? "";
  const extracted = extractVisibleLlmContent(rawContent, message?.thinking ?? message?.reasoning_content);
  if (!extracted.content) {
    await storeLocalLlmDebug(request, usedRequestBody, {
      status: response.status,
      rawContent,
      thinking: extracted.thinking,
      finalContent: extracted.content,
      durationMs: Date.now() - startedAt
    });
    throw new Error("Local LLM returned no text.");
  }

  await storeLocalLlmDebug(request, usedRequestBody, {
    status: response.status,
    rawContent,
    thinking: extracted.thinking,
    finalContent: extracted.content,
    durationMs: Date.now() - startedAt
  });
  return {
    response,
    requestBody: usedRequestBody,
    startedAt,
    baseUrl,
    content: extracted.content,
    thinking: extracted.thinking,
    rawContent
  };
}

function createLocalLlmRequestBody(request: LocalLlmChatRequest, stream: boolean): LocalLlmRequestBody {
  return {
    model: request.model.trim(),
    temperature: 0.1,
    max_tokens: request.maxTokens,
    stream,
    reasoning_effort: "none",
    reasoning: {
      effort: "none"
    },
    messages: [
      {
        role: "system",
        content: request.systemPrompt
      },
      {
        role: "user",
        content: request.userPrompt
      }
    ]
  };
}

async function postLocalLlmChat(baseUrl: string, apiKey: string, requestBody: LocalLlmRequestBody): Promise<Response> {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {})
    },
    body: JSON.stringify(requestBody)
  });
}

async function streamLocalLlmChat(
  port: RuntimePort,
  isDisconnected: () => boolean,
  request: LocalLlmChatRequest
): Promise<void> {
  const completion = await requestLocalLlmCompletion(request, true);
  if (!completion.response.ok) {
    await storeLocalLlmDebug(request, completion.requestBody, {
      status: completion.response.status,
      error: await safeReadResponseText(completion.response),
      durationMs: Date.now() - completion.startedAt
    });
    throw new Error(`Local LLM failed: ${completion.response.status}`);
  }

  if (!completion.response.body) {
    const result = (await completion.response.json()) as OpenAiChatResponse;
    const message = result.choices?.[0]?.message;
    const rawContent = message?.content?.trim() ?? "";
    const extracted = extractVisibleLlmContent(rawContent, message?.thinking ?? message?.reasoning_content);
    postPortMessage(port, isDisconnected(), { type: "replace", text: extracted.content });
    postPortMessage(port, isDisconnected(), { type: "done", text: extracted.content });
    await storeLocalLlmDebug(request, completion.requestBody, {
      status: completion.response.status,
      rawContent,
      thinking: extracted.thinking,
      finalContent: extracted.content,
      durationMs: Date.now() - completion.startedAt
    });
    return;
  }

  const reader = completion.response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawContent = "";
  let thinkingField = "";
  let finalContent = "";
  while (!isDisconnected()) {
    const read = await reader.read();
    if (read.done) {
      break;
    }

    buffer += decoder.decode(read.value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const parsed = parseOpenAiStreamLine(line);
      if (parsed.done) {
        await reader.cancel().catch(() => undefined);
        buffer = "";
        break;
      }
      if (!parsed.body) {
        continue;
      }

      const delta = parsed.body.choices?.[0]?.delta;
      const contentDelta = delta?.content ?? "";
      const thinkingDelta = delta?.thinking ?? delta?.reasoning_content ?? "";
      if (contentDelta) {
        rawContent += contentDelta;
      }
      if (thinkingDelta) {
        thinkingField += thinkingDelta;
      }
      const extracted = extractVisibleLlmContent(rawContent, thinkingField);
      if (extracted.content && extracted.content !== finalContent) {
        finalContent = extracted.content;
        postPortMessage(port, isDisconnected(), { type: "replace", text: finalContent });
      }
    }
  }

  const extracted = extractVisibleLlmContent(rawContent, thinkingField);
  finalContent = extracted.content;
  await storeLocalLlmDebug(request, completion.requestBody, {
    status: completion.response.status,
    rawContent,
    thinking: extracted.thinking,
    finalContent,
    durationMs: Date.now() - completion.startedAt
  });

  if (!finalContent) {
    throw new Error("Local LLM returned no text.");
  }

  postPortMessage(port, isDisconnected(), { type: "done", text: finalContent });
}

function parseOpenAiStreamLine(line: string): {
  done?: boolean;
  body?: {
    choices?: Array<{
      delta?: {
        content?: string;
        thinking?: string;
        reasoning_content?: string;
      };
    }>;
  };
} {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return {};
  }

  const data = trimmed.replace(/^data:\s*/u, "");
  if (data === "[DONE]") {
    return { done: true };
  }

  try {
    return { body: JSON.parse(data) as NonNullable<ReturnType<typeof parseOpenAiStreamLine>["body"]> };
  } catch {
    return {};
  }
}

function postPortMessage(port: RuntimePort, disconnected: boolean, message: unknown): void {
  if (disconnected) {
    return;
  }

  try {
    port.postMessage(message);
  } catch {
    // The tab may have reloaded while the local model was still streaming.
  }
}

function extractVisibleLlmContent(rawContent: string, thinkingField: string | undefined): { content: string; thinking: string } {
  const thinkMatches = [...rawContent.matchAll(/<think>([\s\S]*?)<\/think>/giu)];
  const thinking = [
    thinkingField?.trim() ?? "",
    ...thinkMatches.map((match) => match[1]?.trim() ?? "")
  ]
    .filter(Boolean)
    .join("\n\n");
  const content = rawContent
    .replace(/<think>[\s\S]*?<\/think>/giu, "")
    .replace(/^\s*(answer|final)\s*:\s*/iu, "")
    .trim();
  return { content, thinking };
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function storeLocalLlmDebug(
  request: LocalLlmChatRequest,
  requestBody: Record<string, unknown>,
  result: {
    status: number;
    rawContent?: string;
    thinking?: string;
    finalContent?: string;
    error?: string;
    durationMs: number;
  }
): Promise<void> {
  if (!request.debugEnabled) {
    return;
  }

  await chrome.storage.local.set({
    [LLM_DEBUG_LAST_KEY]: {
      createdAt: new Date().toISOString(),
      baseUrl: normalizeLocalLlmBaseUrl(request.baseUrl),
      model: request.model.trim(),
      durationMs: result.durationMs,
      status: result.status,
      request: requestBody,
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      rawContent: result.rawContent ?? "",
      thinking: result.thinking ?? "",
      finalContent: result.finalContent ?? "",
      error: result.error ?? ""
    }
  });
}

async function translateWithMicrosoft(request: TranslateTextRequest): Promise<string> {
  if (!request.microsoftTranslatorKey.trim()) {
    throw new Error("Microsoft Translator key is required.");
  }

  const params = new URLSearchParams({
    "api-version": "3.0",
    from: mapMicrosoftLanguage(request.sourceLanguage),
    to: mapMicrosoftLanguage(request.targetLanguage)
  });
  const response = await fetch(`https://api.cognitive.microsofttranslator.com/translate?${params}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": request.microsoftTranslatorKey,
      ...(request.microsoftTranslatorRegion.trim()
        ? { "Ocp-Apim-Subscription-Region": request.microsoftTranslatorRegion.trim() }
        : {})
    },
    body: JSON.stringify([{ text: request.text }])
  });

  if (!response.ok) {
    throw new Error(`Microsoft Translator failed: ${response.status}`);
  }

  const result = (await response.json()) as MicrosoftTranslateResponse;
  const translatedText = result[0]?.translations?.[0]?.text?.trim();
  if (!translatedText) {
    throw new Error("Microsoft Translator returned no text.");
  }

  return translatedText;
}

function mapMicrosoftLanguage(language: string): string {
  if (language === "no") {
    return "nb";
  }

  return language;
}

function normalizeLocalLlmBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/g, "");
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function createGrammarSystemPrompt(): string {
  return createPrompt("grammarSystem", undefined, {});
}

function createGrammarUserPrompt(request: ExplainGrammarRequest): string {
  return createPrompt("grammarUser", request.promptTemplates, createGrammarPromptVariables(request));
}

function createLineTranslationSystemPrompt(): string {
  return createPrompt("lineTranslationSystem", undefined, {});
}

function createLineTranslationUserPrompt(request: TranslateTextRequest): string {
  return createPrompt("lineTranslationUser", request.promptTemplates, createTranslationPromptVariables(request));
}

function createSelectedTranslationSystemPrompt(): string {
  return createPrompt("selectedTranslationSystem", undefined, {});
}

function createSelectedTranslationUserPrompt(request: TranslateTextRequest): string {
  return createPrompt("selectedTranslationUser", request.promptTemplates, createTranslationPromptVariables(request));
}

function createAttemptEvaluationSystemPrompt(): string {
  return createPrompt("attemptEvaluationSystem", undefined, {});
}

function createAttemptEvaluationUserPrompt(request: EvaluateAttemptRequest): string {
  return createPrompt("attemptEvaluationUser", request.promptTemplates, createAttemptPromptVariables(request));
}

function createPrompt(
  key: PromptTemplateKey,
  templates: PromptTemplateMap | undefined,
  variables: Record<string, string | undefined>
): string {
  const template = mergePromptTemplates(templates)[key];
  return renderPromptTemplate(template, variables);
}

function renderPromptTemplate(template: string, variables: Record<string, string | undefined>): string {
  return template
    .replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/gu, (_match, key: string) => variables[key]?.trim() ?? "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function createCommonPromptVariables(request: {
  sourceLanguage: string;
  targetLanguage: string;
}): Record<string, string> {
  return {
    sourceLanguage: request.sourceLanguage,
    targetLanguage: request.targetLanguage
  };
}

function createTranslationPromptVariables(request: TranslateTextRequest): Record<string, string | undefined> {
  return {
    ...createCommonPromptVariables(request),
    text: request.text,
    sentence: request.sentence,
    markedSentence: request.sentence ? markSelectedText(request.sentence, request.text) : request.text
  };
}

function createGrammarPromptVariables(request: ExplainGrammarRequest): Record<string, string | undefined> {
  return {
    ...createCommonPromptVariables(request),
    sentence: request.sentence,
    markedSentence: markSelectedText(request.sentence, request.selectedText),
    selectedText: request.selectedText ? `*${request.selectedText}*` : "none",
    translation: request.translation
  };
}

function createAttemptPromptVariables(request: EvaluateAttemptRequest): Record<string, string | undefined> {
  return {
    ...createCommonPromptVariables(request),
    sentence: request.sentence,
    translation: request.translation ?? "not provided",
    attempt: request.attempt
  };
}

function markSelectedText(sentence: string, selectedText: string | undefined): string {
  const selected = selectedText?.trim();
  if (!selected || sentence.includes(`*${selected}*`)) {
    return sentence;
  }

  const index = sentence.toLocaleLowerCase().indexOf(selected.toLocaleLowerCase());
  if (index < 0) {
    return sentence;
  }

  return `${sentence.slice(0, index)}*${sentence.slice(index, index + selected.length)}*${sentence.slice(index + selected.length)}`;
}

async function findReusableDeepLTab(): Promise<DeepLTab | undefined> {
  const state = await getDeepLState();
  const storedTab = await getStoredDeepLTab(state);

  if (storedTab) {
    return { ...storedTab, managed: true };
  }

  await chrome.storage.local.remove(DEEPL_STATE_KEY);
  return undefined;
}

async function getStoredDeepLTab(state: DeepLState): Promise<DeepLTab | undefined> {
  if (!state.tabId) {
    return undefined;
  }

  try {
    const tab = await chrome.tabs.get(state.tabId);
    return isDeepLTranslatorTab(tab) ? tab : undefined;
  } catch {
    return undefined;
  }
}

function isDeepLTranslatorTab(tab: DeepLTab): boolean {
  if (typeof tab.id !== "number" || !tab.url) {
    return false;
  }

  try {
    const url = new URL(tab.url);
    return url.hostname.endsWith("deepl.com") && url.pathname.includes("translator");
  } catch {
    return false;
  }
}

async function updateDeepLWindowBounds(
  windowId: number,
  request: DeepLRequest,
  managedWindow: boolean | undefined
): Promise<void> {
  let windowInfo: { type?: string };
  try {
    windowInfo = await chrome.windows.get(windowId);
  } catch {
    return;
  }

  const shouldResize = managedWindow || windowInfo.type === "popup";
  const bounds = shouldResize ? await resolveDeepLWindowBounds(request) : undefined;

  await chrome.windows.update(windowId, {
    width: shouldResize ? DEEPL_POPUP_WIDTH : undefined,
    height: shouldResize ? DEEPL_POPUP_HEIGHT : undefined,
    left: bounds?.left,
    top: bounds?.top,
    focused: request.focusOnUpdate
  });
}

async function fetchText(url: string): Promise<string> {
  if (!isAllowedFetchUrl(url)) {
    throw new Error("Blocked fetch URL.");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }

  return response.text();
}

function isAllowedFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://psapi.nrk.no" || parsed.origin === "https://undertekst.nrk.no";
  } catch {
    return false;
  }
}

function isFetchTextRequest(message: unknown): message is FetchTextRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as FetchTextRequest).type === "ylang:fetchText" &&
    typeof (message as FetchTextRequest).url === "string"
  );
}

function isTranslateTextRequest(message: unknown): message is TranslateTextRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as TranslateTextRequest).type === "ylang:translate.text" &&
    ((message as TranslateTextRequest).provider === "microsoft-translator" ||
      (message as TranslateTextRequest).provider === "local-llm") &&
    typeof (message as TranslateTextRequest).text === "string"
  );
}

function isExplainGrammarRequest(message: unknown): message is ExplainGrammarRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as ExplainGrammarRequest).type === "ylang:llm.explainGrammar" &&
    typeof (message as ExplainGrammarRequest).sentence === "string"
  );
}

function isEvaluateAttemptRequest(message: unknown): message is EvaluateAttemptRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as EvaluateAttemptRequest).type === "ylang:llm.evaluateAttempt" &&
    typeof (message as EvaluateAttemptRequest).sentence === "string" &&
    typeof (message as EvaluateAttemptRequest).attempt === "string"
  );
}

function isLocalLlmStreamEnvelope(message: unknown): message is LocalLlmStreamEnvelope {
  if (
    typeof message !== "object" ||
    message === null ||
    (message as LocalLlmStreamEnvelope).type !== "ylang:llm.stream"
  ) {
    return false;
  }

  const request = (message as LocalLlmStreamEnvelope).request;
  return isTranslateTextRequest(request) || isExplainGrammarRequest(request) || isEvaluateAttemptRequest(request);
}

async function sendDeepLText(tabId: number, request: DeepLRequest): Promise<string | undefined | false> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "ylang:deepl.setText",
      text: request.text,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage
    });
    const result = response as { ok?: boolean; translatedText?: string } | undefined;
    return result?.ok ? result.translatedText : false;
  } catch {
    return false;
  }
}

async function getDeepLState(): Promise<DeepLState> {
  const stored = await chrome.storage.local.get(DEEPL_STATE_KEY);
  return (stored[DEEPL_STATE_KEY] as DeepLState | undefined) ?? {};
}

async function saveDeepLState(state: DeepLState): Promise<void> {
  await chrome.storage.local.set({ [DEEPL_STATE_KEY]: state });
}

function isDeepLRequest(message: unknown): message is DeepLRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as DeepLRequest).type === "ylang:deepl.translate" &&
    typeof (message as DeepLRequest).text === "string"
  );
}

function isDeepLDisplaysRequest(message: unknown): message is DeepLDisplaysRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as DeepLDisplaysRequest).type === "ylang:deepl.displays"
  );
}

async function getDeepLDisplays(): Promise<Array<{
  id: string;
  name?: string;
  isPrimary: boolean;
  width: number;
  height: number;
}>> {
  const displays = await getDisplayInfo();
  return displays.map((display) => ({
    id: display.id,
    name: display.name,
    isPrimary: Boolean(display.isPrimary),
    width: display.workArea?.width ?? display.bounds.width,
    height: display.workArea?.height ?? display.bounds.height
  }));
}

async function resolveDeepLWindowBounds(request: DeepLRequest): Promise<{ left: number; top: number }> {
  const display = await resolveDisplay(request.screenId);
  const area = display.workArea ?? display.bounds;
  const xPercent = normalizePercent(request.windowXPercent, 5);
  const yPercent = normalizePercent(request.windowYPercent, request.pinToTop ? 0 : 5);
  return {
    left: Math.round(area.left + Math.max(0, area.width - DEEPL_POPUP_WIDTH) * (xPercent / 100)),
    top: Math.round(area.top + Math.max(0, area.height - DEEPL_POPUP_HEIGHT) * (yPercent / 100))
  };
}

async function resolveDisplay(screenId: string | undefined): Promise<DisplayInfo> {
  const displays = await getDisplayInfo();
  const selected = screenId && screenId !== "primary"
    ? displays.find((display) => display.id === screenId)
    : undefined;
  return selected ?? displays.find((display) => display.isPrimary) ?? displays[0] ?? createFallbackDisplay();
}

async function getDisplayInfo(): Promise<DisplayInfo[]> {
  try {
    return await chrome.system?.display?.getInfo() ?? [];
  } catch {
    return [];
  }
}

function createFallbackDisplay(): DisplayInfo {
  return {
    id: "primary",
    isPrimary: true,
    bounds: { left: 0, top: 0, width: 1920, height: 1080 },
    workArea: { left: 0, top: 0, width: 1920, height: 1040 }
  };
}

function normalizePercent(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : fallback;
}

function createDeepLBaseUrl(sourceLanguage: string, targetLanguage: string): string {
  const source = sourceLanguage === "no" ? "nb" : sourceLanguage;
  return `https://www.deepl.com/translator#${source}/${targetLanguage}/`;
}

function createDeepLUrl(text: string, sourceLanguage: string, targetLanguage: string): string {
  return `${createDeepLBaseUrl(sourceLanguage, targetLanguage)}${encodeURIComponent(text)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export {};
