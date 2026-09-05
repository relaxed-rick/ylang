import type { SourceRef, TargetLanguage, TranslationRecord } from "../../core/types";
import { sha256 } from "../../core/text";
import { browserApi } from "./browserApi";

export async function createTranslationCacheKey(
  source: SourceRef,
  normalizedText: string,
  targetLanguage: TargetLanguage
): Promise<string> {
  const sourceKey = source.programId ?? source.videoId ?? source.url;
  const hash = await sha256(`${source.provider}:${sourceKey}:${targetLanguage}:${normalizedText}`);
  return `ylang:translation:${hash}`;
}

export async function getTranslation(cacheKey: string): Promise<TranslationRecord | undefined> {
  const stored = await browserApi.storage?.local?.get(cacheKey);
  return stored?.[cacheKey] as TranslationRecord | undefined;
}

export async function saveTranslation(record: TranslationRecord): Promise<void> {
  await browserApi.storage?.local?.set({ [record.cacheKey]: record });
}
